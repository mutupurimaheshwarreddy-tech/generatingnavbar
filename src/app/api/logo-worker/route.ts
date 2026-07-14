import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { v2 as cloudinary } from 'cloudinary';
import { prisma } from '@/lib/prisma';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dyn40clci',
  api_key: process.env.CLOUDINARY_API_KEY || '328476136325637',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'a7MiQt_aMZfhuCe2891nUdgJDVs',
});

const BANNED_KEYWORDS = ['facebook', 'instagram', 'twitter', 'linkedin', 'tiktok', 'youtube', 'pinterest', 'google'];

// Advanced Cloudinary Upload with AI Background Removal & AVIF
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
        if (!result) return reject(new Error("Upload failed"));
        
        // e_background_removal requires the Cloudinary add-on to be enabled in your dashboard.
        // If not enabled, it will fallback to standard rendering. f_avif converts to AVIF.
        const optimizedUrl = result.secure_url.replace(
          '/upload/', 
          '/upload/e_background_removal/e_trim/c_pad,w_400,h_400,b_transparent/f_avif,q_auto:best/'
        );
        resolve(optimizedUrl);
      }
    );
    uploadStream.end(buffer);
  });
}

// Waterfall Extraction Strategy
async function extractLogoUrlFromWebsite(websiteUrl: string, domain: string): Promise<string | null> {
  // 1. Try Clearbit first (usually the best quality and already transparent)
  try {
    const clearbitUrl = `https://logo.clearbit.com/${domain}?size=400`;
    const cbCheck = await fetch(clearbitUrl, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
    if (cbCheck.ok && cbCheck.headers.get('content-type')?.includes('image')) {
      return clearbitUrl;
    }
  } catch (e) { /* Ignore and continue */ }

  // 2. Scrape the website aggressively
  try {
    const secureUrl = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;
    
    const response = await fetch(secureUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(8000) // 8 second strict timeout
    });

    if (response.ok) {
      const html = await response.text();
      const $ = cheerio.load(html);
      let foundSrc = '';

      const selectors = [
        'meta[property="og:image"]', // Often contains high-res brand image
        'a.navbar-brand img', 'header img[src*="logo" i]', 'img[class*="logo" i]', 
        'img[id*="logo" i]', 'img[alt*="logo" i]', 'link[rel="apple-touch-icon"]',
        'link[rel="icon"]'
      ];

      for (const selector of selectors) {
        const el = $(selector).first();
        if (el.length > 0) {
          let src = el.attr('src') || el.attr('content') || el.attr('href') || el.attr('data-src');
          if (src && !src.startsWith('data:')) {
            const lowerSrc = src.toLowerCase();
            if (BANNED_KEYWORDS.some(kw => lowerSrc.includes(kw))) continue;
            foundSrc = src;
            break;
          }
        }
      }

      if (foundSrc) {
        if (foundSrc.startsWith('//')) return `https:${foundSrc}`;
        if (!foundSrc.startsWith('http')) return new URL(foundSrc, secureUrl).href;
        return foundSrc;
      }
    }
  } catch (err) { /* Scrape failed, move to fallback */ }

  // 3. Fallback: Google High-Res Favicon API
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=256`;
}

export async function POST(req: Request) {
  try {
    // Take a small batch so Vercel doesn't kill the function (safe for 10-second limits)
    const websites = await prisma.websiteData.findMany({
      where: { logoStatus: "pending" },
      orderBy: { row_number: 'asc' },
      take: 5 
    });

    if (websites.length === 0) {
      return NextResponse.json({ message: "All done!" });
    }

    console.log(`Processing batch of ${websites.length}...`);

    for (const site of websites) {
      try {
        const urlObj = new URL(site.Website.startsWith('http') ? site.Website : `https://${site.Website}`);
        const domain = urlObj.hostname.replace('www.', '');
        const cleanDomainForId = domain.replace(/\./g, '_');

        const finalDownloadUrl = await extractLogoUrlFromWebsite(site.Website, domain);
        
        let imageResponse = await fetch(finalDownloadUrl!, { 
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(10000)
        });

        // Last resort: UI Avatars Text Logo
        if (!imageResponse.ok) {
          const textLogoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(domain)}&background=random&color=fff&size=400&format=png`;
          imageResponse = await fetch(textLogoUrl);
        }

        const arrayBuffer = await imageResponse.arrayBuffer();
        const imageBuffer = Buffer.from(arrayBuffer);
        const cloudinaryUrl = await uploadToCloudinary(imageBuffer, cleanDomainForId);

        await prisma.websiteData.update({
          where: { id: site.id },
          data: { logoUrl: cloudinaryUrl, logoStatus: "success", logoChecked: true }
        });

      } catch (error) {
        console.error(`Failed ${site.Website}`);
        await prisma.websiteData.update({
          where: { id: site.id },
          data: { logoStatus: "failed", logoChecked: true }
        });
      }
    }

    // FIRE AND FORGET RECURSION
    // This calls the API route again to process the next batch.
    // It runs in the background, so you can close the browser tab.
    const protocol = req.headers.get('x-forwarded-proto') || 'http';
    const host = req.headers.get('host');
    const selfUrl = `${protocol}://${host}/api/logo-worker`;
    
    fetch(selfUrl, { method: 'POST' }).catch(console.error);
    
    // Slight delay to ensure the fetch fires before Vercel freezes the container
    await new Promise(resolve => setTimeout(resolve, 200));

    return NextResponse.json({ 
      success: true, 
      message: "Batch processed, triggering next batch in background." 
    });

  } catch (error: any) {
    console.error("Worker Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}