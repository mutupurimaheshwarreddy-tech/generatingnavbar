'use server';

import * as cheerio from 'cheerio';
import { v2 as cloudinary } from 'cloudinary';
import { prisma } from '@/lib/prisma';

cloudinary.config({
  cloud_name: 'dyn40clci',
  api_key: '328476136325637',
  api_secret: 'a7MiQt_aMZfhuCe2891nUdgJDVs',
});

async function uploadToCloudinary(buffer: Buffer, publicId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        folder: 'logos',
        overwrite: true,
        resource_type: 'image',
      },
      (error, result) => {
        if (error) return reject(error);
        if (!result) reject(new Error("Upload failed"));
        
        const optimizedUrl = result!.secure_url.replace('/upload/', '/upload/f_avif,q_auto/');
        resolve(optimizedUrl);
      }
    );
    uploadStream.end(buffer);
  });
}

async function extractLogoUrlFromWebsite(websiteUrl: string): Promise<string | null> {
  try {
    const secureUrl = websiteUrl.replace('http://', 'https://');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(secureUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      },
      next: { revalidate: 0 },
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    if (!response.ok) return null;

    const html = await response.text();
    const $ = cheerio.load(html);
    let foundSrc = '';

    const selectors = [
      'img[class*="logo" i]', 'img[id*="logo" i]', 'a[class*="logo" i] img',
      'div[class*="logo" i] img', 'img[src*="logo" i]', 'img[alt*="logo" i]',
      '.navbar-brand img', 'header img', 'a[href="/"] img'
    ];

    for (const selector of selectors) {
      const img = $(selector).first();
      if (img.length > 0) {
        let src = img.attr('src');
        if (src?.startsWith('/_next/image')) {
          const urlParam = new URL(src, 'http://dummy.com').searchParams.get('url');
          if (urlParam) src = urlParam;
        }
        if (src && !src.startsWith('data:')) {
          foundSrc = src;
          break; 
        }
      }
    }

    if (!foundSrc) {
      foundSrc = $('meta[property="og:image"]').attr('content') || 
                 $('link[rel="apple-touch-icon"]').attr('href') || 
                 $('link[rel*="icon"]').attr('href') || '';
    }

    if (!foundSrc) return null;
    if (foundSrc.startsWith('//')) return `https:${foundSrc}`;
    if (!foundSrc.startsWith('http')) return new URL(foundSrc, secureUrl).href;

    return foundSrc;
  } catch (err) {
    return null;
  }
}

export async function generateLogosAction() {
  try {
    // 1. Fetch only records that haven't been successfully processed yet
    const websites = await prisma.websiteData.findMany({
      where: {
        logoStatus: { not: "success" }
      },
      orderBy: {
        row_number: 'asc'
      }
    });

    console.log(`Found ${websites.length} remaining websites to process in Neon DB.`);

    for (let i = 0; i < websites.length; i++) {
      const site = websites[i];
      console.log(`[${i + 1}/${websites.length}] Scraping: ${site.Website}`);

      try {
        const urlObj = new URL(site.Website);
        const domain = urlObj.hostname.replace('www.', '').replace(/\./g, '_');

        const directLogoUrl = await extractLogoUrlFromWebsite(site.Website);
        const finalDownloadUrl = directLogoUrl || `https://logo.clearbit.com/${urlObj.hostname}`;

        const imageResponse = await fetch(finalDownloadUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!imageResponse.ok) throw new Error('Download failed');
        
        const arrayBuffer = await imageResponse.arrayBuffer();
        const imageBuffer = Buffer.from(arrayBuffer);

        // Upload directly to Cloudinary
        const cloudinaryUrl = await uploadToCloudinary(imageBuffer, domain);

        // 2. Update the specific row inside your Neon Database instantly
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
        
        // Mark as failed in the database so it's tracked
        await prisma.websiteData.update({
          where: { id: site.id },
          data: {
            logoStatus: "failed",
            logoChecked: true
          }
        });
      }

      // Respect rate limits with a small rest period
      await new Promise(resolve => setTimeout(resolve, 600));
    }

    return { success: true, message: "Neon database updated successfully with all logos." };
  } catch (error: any) {
    console.error("Global Action Error:", error);
    return { success: false, message: error.message };
  }
}