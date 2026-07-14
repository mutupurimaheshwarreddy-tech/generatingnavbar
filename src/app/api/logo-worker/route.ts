import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { v2 as cloudinary } from 'cloudinary';
import { prisma } from '@/lib/prisma';
import { removeBackground } from "@imgly/background-removal-node";

cloudinary.config({
  cloud_name: 'dyn40clci',
  api_key: '328476136325637',
  api_secret: 'a7MiQt_aMZfhuCe2891nUdgJDVs',
});

const BANNED_KEYWORDS = ['facebook', 'instagram', 'twitter', 'linkedin', 'tiktok', 'youtube', 'pinterest', 'google', 'placeholder'];

async function uploadToCloudinary(buffer: Buffer, publicId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        folder: 'logos',
        overwrite: true,
        resource_type: 'auto',
      },
      (error, result) => {
        if (error) return reject(error);
        if (!result) return reject(new Error("Upload failed"));
        
        const optimizedUrl = result.secure_url.replace(
          '/upload/', 
          '/upload/e_trim/f_avif,q_auto/'
        );
        resolve(optimizedUrl);
      }
    );
    uploadStream.end(buffer);
  });
}

async function extractLogoUrlFromWebsite(websiteUrl: string): Promise<string | null> {
  try {
    const secureUrl = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(secureUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const html = await response.text();
    const $ = cheerio.load(html);
    let foundSrc = '';

    // STRATEGY 1: JSON-LD Schema
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const json = JSON.parse($(el).html() || '{}');
        if (json.logo) foundSrc = typeof json.logo === 'string' ? json.logo : json.logo.url;
        if (json['@graph']) {
          const org = json['@graph'].find((item: any) => item['@type'] === 'Organization');
          if (org && org.logo) foundSrc = typeof org.logo === 'string' ? org.logo : org.logo.url;
        }
      } catch (e) {}
    });

    // STRATEGY 2: Common Selectors
    if (!foundSrc) {
      const selectors = [
        '.site-logo img', 'a.navbar-brand img', 'header img[src*="logo" i]',
        'img[alt*="logo" i]', 'img[class*="logo" i]', 'link[rel="apple-touch-icon"]'
      ];
      for (const selector of selectors) {
        const el = $(selector).first();
        if (el.length > 0) {
          foundSrc = el.attr('src') || el.attr('data-src') || el.attr('href') || '';
          if (foundSrc && !BANNED_KEYWORDS.some(kw => foundSrc.toLowerCase().includes(kw))) {
            break; 
          }
        }
      }
    }

    if (!foundSrc) return null;
    
    if (foundSrc.startsWith('//')) return `https:${foundSrc}`;
    if (!foundSrc.startsWith('http')) return new URL(foundSrc, secureUrl).href;

    return foundSrc;
  } catch (err) {
    return null;
  }
}

// THIS IS THE REQUIRED EXPORT FOR NEXT.JS API ROUTES
export async function POST(req: Request) {
  try {
    const websites = await prisma.websiteData.findMany({
      where: { logoStatus: "pending" },
      orderBy: { row_number: 'asc' },
      take: 5 // Process 5 per batch
    });

    if (websites.length === 0) {
      return NextResponse.json({ success: true, done: true, message: "All websites processed!" });
    }

    for (const site of websites) {
      try {
        const safeUrl = site.Website.startsWith('http') ? site.Website : `https://${site.Website}`;
        const urlObj = new URL(safeUrl);
        const domain = urlObj.hostname.replace('www.', '');
        const cleanDomainForId = domain.replace(/\./g, '_');

        let finalDownloadUrl = await extractLogoUrlFromWebsite(safeUrl);
        let usedTextFallback = false;

        if (!finalDownloadUrl) {
          finalDownloadUrl = `https://logo.clearbit.com/${domain}`;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        let imageResponse = await fetch(finalDownloadUrl, { 
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!imageResponse.ok) {
          finalDownloadUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(domain)}&background=random&color=fff&size=512&format=png`;
          imageResponse = await fetch(finalDownloadUrl);
          usedTextFallback = true;
        }

        const arrayBuffer = await imageResponse.arrayBuffer();
        let finalBuffer = Buffer.from(arrayBuffer);

        if (!usedTextFallback) {
          try {
            const imageBlob = new Blob([finalBuffer], { type: 'image/png' }); 
            const transparentBlob = await removeBackground(imageBlob);
            finalBuffer = Buffer.from(await transparentBlob.arrayBuffer());
          } catch (bgError) {
            console.error(`Background removal failed for ${domain}, proceeding with original image.`);
          }
        }

        const cloudinaryUrl = await uploadToCloudinary(finalBuffer, cleanDomainForId);

        await prisma.websiteData.update({
          where: { id: site.id },
          data: {
            logoUrl: cloudinaryUrl,
            logoStatus: "success",
            logoChecked: true
          }
        });

      } catch (error) {
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
    return NextResponse.json({ success: true, done: false, remaining, message: `Batch complete.` });

  } catch (error: any) {
    return NextResponse.json({ success: false, done: false, message: error.message }, { status: 500 });
  }
}