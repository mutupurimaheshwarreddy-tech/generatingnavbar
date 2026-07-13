'use server';

import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';
import { v2 as cloudinary } from 'cloudinary';
import { WebsiteData } from '@/types/logo';

// Configure Cloudinary with your credentials
cloudinary.config({
  cloud_name: 'dyn40clci',
  api_key: '328476136325637',
  api_secret: 'a7MiQt_aMZfhuCe2891nUdgJDVs',
});

// Helper: Stream a node buffer into Cloudinary
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
        if (!result) return reject(new Error("Upload failed with no result"));

        // Optimize URL with Cloudinary transformations:
        // f_avif: Converts the output format to highly compressed AVIF automatically
        // q_auto: Optimizes the compression quality without losing human-perceptible clarity
        // e_make_transparent: Strips solid white backgrounds out for free (Optional)
        const optimizedUrl = result.secure_url.replace(
          '/upload/',
          '/upload/f_avif,q_auto/'
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout per site

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
      'img[class*="logo" i]',
      'img[id*="logo" i]',
      'a[class*="logo" i] img',
      'div[class*="logo" i] img',
      'img[src*="logo" i]',
      'img[alt*="logo" i]',
      '.navbar-brand img',
      'header img',
      'a[href="/"] img'
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

    if (foundSrc.startsWith('//')) {
      return `https:${foundSrc}`;
    } else if (!foundSrc.startsWith('http')) {
      return new URL(foundSrc, secureUrl).href;
    }

    return foundSrc;
  } catch (err) {
    return null;
  }
}

export async function generateLogosAction() {
  const jsonPath = path.join(process.cwd(), 'src', 'data', 'test.json');

  try {
    const fileContent = await fs.readFile(jsonPath, 'utf-8');
    const websites: WebsiteData[] = JSON.parse(fileContent);

    console.log(`Starting Cloudinary queue for ${websites.length} entries...`);

    for (let i = 0; i < websites.length; i++) {
      const site = websites[i];
      
      websites[i] = {
        ...site,
        logoUrl: site.logoUrl || "",
        logoShape: site.logoShape || "unknown",
        logoStatus: site.logoStatus || "pending",
        logoChecked: site.logoChecked || false,
      };

      if (websites[i].logoStatus === "success") {
        continue; // Skip items already safely up on Cloudinary
      }

      console.log(`[${i + 1}/${websites.length}] Uploading logo for: ${site.Website}`);

      try {
        const urlObj = new URL(site.Website);
        const domain = urlObj.hostname.replace('www.', '').replace(/\./g, '_'); // Safe public_id string

        // 1. Find logo URL
        const directLogoUrl = await extractLogoUrlFromWebsite(site.Website);
        const finalDownloadUrl = directLogoUrl || `https://logo.clearbit.com/${urlObj.hostname}`;

        // 2. Fetch image into Buffer memory
        const imageResponse = await fetch(finalDownloadUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!imageResponse.ok) throw new Error('Failed to download image file');
        
        const arrayBuffer = await imageResponse.arrayBuffer();
        const imageBuffer = Buffer.from(arrayBuffer);

        // 3. Push to Cloudinary
        const cloudinaryUrl = await uploadToCloudinary(imageBuffer, domain);

        // 4. Save Cloudinary URL to JSON object
        websites[i].logoUrl = cloudinaryUrl;
        websites[i].logoStatus = "success";
        websites[i].logoChecked = true;

      } catch (error) {
        console.error(`  -> [Failed] ${site.Website}`);
        websites[i].logoStatus = "failed";
        websites[i].logoChecked = true;
      }

      // Safe progressive file writes
      await fs.writeFile(jsonPath, JSON.stringify(websites, null, 2), 'utf-8');
      
      // Small break to protect rate limits
      await new Promise(resolve => setTimeout(resolve, 800));
    }

    return { success: true, message: "Queue sync to Cloudinary finished." };
  } catch (error: any) {
    console.error("Global Action Error:", error);
    return { success: false, message: error.message };
  }
}