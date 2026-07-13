'use server';

import fs from 'fs/promises';
import path from 'path';
import { prisma } from '@/lib/prisma'; // Make sure this path matches your setup

export async function seedJsonAction() {
  try {
    // 1. Locate and read the JSON file
    const jsonPath = path.join(process.cwd(), 'src', 'data', 'test.json');
    const fileContent = await fs.readFile(jsonPath, 'utf-8');
    const websites = JSON.parse(fileContent);

    // 2. Insert into Neon Database (skipping URLs that already exist)
    const result = await prisma.websiteData.createMany({
      data: websites.map((site: any) => ({
        row_number: site.row_number,
        Website: site.Website,
        logoUrl: site.logoUrl || "",
        logoShape: site.logoShape || "unknown",
        logoStatus: site.logoStatus || "pending",
        logoChecked: site.logoChecked || false,
      })),
      skipDuplicates: true, // Requires @unique on the Website field in schema.prisma
    });

    return { 
      success: true, 
      message: `Successfully inserted ${result.count} new records into Neon DB.` 
    };

  } catch (error: any) {
    console.error("Seeding Action failed:", error);
    return { 
      success: false, 
      message: error.message || "An unknown error occurred" 
    };
  }
}