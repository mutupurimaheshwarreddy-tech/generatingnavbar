// src/actions/extractLogos.ts
'use server';

import * as cheerio from 'cheerio';
import { v2 as cloudinary } from 'cloudinary';
import { prisma } from '@/lib/prisma';

cloudinary.config({
  cloud_name: 'dyn40clci',
  api_key: '328476136325637',
  api_secret: 'a7MiQt_aMZfhuCe2891nUdgJDVs',
});

// Banned keywords to prevent scraping social media icons instead of logos
const BANNED_KEYWORDS = ['facebook', 'instagram', 'twitter', 'linkedin', 'tiktok', 'youtube', 'pinterest'];

async function uploadToCloudinary(buffer: Buffer, publicId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        folder: 'logos',
        overwrite: true,
        resource_type: 'auto', // Allows SVGs to be uploaded correctly
      },
      (error, result) => {
        if (error) return reject(error);
        if (!result) return reject(new Error("Upload failed"));
        
        // Cloudinary Magic Transformations:
        // 1. e_trim: Removes extra whitespace/padding around the logo
        // 2. e_make_transparent:15,co_white: Removes white backgrounds making it a clean PNG style
        // 3. f_avif,q_auto: Converts SVGs/JPEGs to highly optimized AVIF format
        const optimizedUrl = result.secure_url.replace(
          '/upload/', 
          '/upload/e_trim/e_make_transparent:15,co_white/f_avif,q_auto/'
        );
        resolve(optimizedUrl);
      }
    );
    uploadStream.end(buffer);
  });
}

async function extractLogoUrlFromWebsite(websiteUrl: string): Promise<string | null> {
  try {
    const secureUrl = websiteUrl.replace('http://', 'https://');
    
    // Strict 10-second timeout for the HTML fetch to avoid hanging on broken sites
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(secureUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      next: { revalidate: 0 },
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    if (!response.ok) return null;

    const html = await response.text();
    const $ = cheerio.load(html);
    let foundSrc = '';

    // Expanded selectors (Catches Island Dog Spa and Wix sites)
    const selectors = [
      'img[class*="logo" i]', 'img[id*="logo" i]', 'a[class*="logo" i] img',
      'div[class*="logo" i] img', 'img[src*="logo" i]', 'img[alt*="logo" i]',
      '.navbar-brand img', 'header img', 'a[href="/"] img',
      'wix-image img', 'img[data-src*="logo" i]', 'link[rel="image_src"]'
    ];

    for (const selector of selectors) {
      const el = $(selector).first();
      if (el.length > 0) {
        let src = el.attr('src') || el.attr('data-src') || el.attr('href');
        
        if (src?.startsWith('/_next/image')) {
          const urlParam = new URL(src, 'http://dummy.com').searchParams.get('url');
          if (urlParam) src = urlParam;
        }

        if (src && !src.startsWith('data:')) {
          const lowerSrc = src.toLowerCase();
          // Skip if it's a social media icon
          if (BANNED_KEYWORDS.some(keyword => lowerSrc.includes(keyword))) continue;
          
          foundSrc = src;
          break; 
        }
      }
    }

    // Fallbacks if selectors fail
    if (!foundSrc) {
      foundSrc = $('meta[property="og:image"]').attr('content') || 
                 $('link[rel="apple-touch-icon"]').attr('href') || 
                 $('link[rel*="icon"]').attr('href') || '';
    }

    if (!foundSrc) return null;
    
    // Clean up relative URLs
    if (foundSrc.startsWith('//')) return `https:${foundSrc}`;
    if (!foundSrc.startsWith('http')) return new URL(foundSrc, secureUrl).href;

    return foundSrc;
  } catch (err) {
    return null; // Gracefully fail on broken websites
  }
}

export async function generateLogosAction() {
  try {
    // BATCHING: Only process 5 at a time to stay under Netlify's 30s limit
    const websites = await prisma.websiteData.findMany({
      where: { logoStatus: "pending" },
      orderBy: { row_number: 'asc' },
      take: 5 
    });

    if (websites.length === 0) {
      return { success: true, done: true, message: "All websites processed!" };
    }

    console.log(`Processing batch of ${websites.length} websites...`);

    for (const site of websites) {
      console.log(`Scraping: ${site.Website}`);

      try {
        const urlObj = new URL(site.Website);
        const domain = urlObj.hostname.replace('www.', '');
        const cleanDomainForId = domain.replace(/\./g, '_');

        // 1. Try to scrape the real logo
        let finalDownloadUrl = await extractLogoUrlFromWebsite(site.Website);
        let fallbackUsed = false;

        // 2. If scrape fails or site is broken, try Clearbit
        if (!finalDownloadUrl) {
          finalDownloadUrl = `https://logo.clearbit.com/${domain}`;
          fallbackUsed = true;
        }

        // 3. Download the image (with a 10s timeout)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        let imageResponse = await fetch(finalDownloadUrl, { 
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        // 4. If Clearbit ALSO fails, generate a Text Logo using ui-avatars
        if (!imageResponse.ok && fallbackUsed) {
          const textLogoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(domain)}&background=random&color=fff&size=512&font-size=0.4&format=png`;
          imageResponse = await fetch(textLogoUrl);
        }

        if (!imageResponse.ok) throw new Error('All image download methods failed');
        
        const arrayBuffer = await imageResponse.arrayBuffer();
        const imageBuffer = Buffer.from(arrayBuffer);

        // 5. Upload to Cloudinary (Handles SVG rasterization and White BG removal)
        const cloudinaryUrl = await uploadToCloudinary(imageBuffer, cleanDomainForId);

        // 6. Update Database
        await prisma.websiteData.update({
          where: { id: site.id },
          data: {
            logoUrl: cloudinaryUrl,
            logoStatus: "success",
            logoChecked: true
          }
        });

      } catch (error) {
        console.error(`  -> [Failed] ${site.Website}`);
        
        await prisma.websiteData.update({
          where: { id: site.id },
          data: {
            logoStatus: "failed",
            logoChecked: true
          }
        });
      }
    }

    const remaining = await prisma.websiteData.count({ where: { logoStatus: "pending" }});
    return { success: true, done: false, remaining, message: `Batch complete. ${remaining} left.` };

  } catch (error: any) {
    console.error("Global Action Error:", error);
    return { success: false, message: error.message };
  }
}