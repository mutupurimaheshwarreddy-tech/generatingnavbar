'use server';

import fs from 'fs/promises';
import path from 'path';
import { revalidatePath } from 'next/cache';

// Define the shape of our JSON data
export interface NavbarData {
  row_number: number;
  Website: string;
  logoUrl: string;
  logoShape: string;
  logoStatus: string;
  logoChecked: boolean;
}

export async function updateLogoStatus(rowNumber: number, newStatus: string) {
  try {
    const jsonPath = path.join(process.cwd(), 'src', 'data', 'test.json');
    
    // Read the file
    const fileContents = await fs.readFile(jsonPath, 'utf8');
    const data: NavbarData[] = JSON.parse(fileContents);
    
    // Update the specific row
    const updatedData = data.map((item) => {
      if (item.row_number === rowNumber) {
        return { ...item, logoStatus: newStatus };
      }
      return item;
    });

    // Write back to the file
    await fs.writeFile(jsonPath, JSON.stringify(updatedData, null, 2), 'utf8');
    
    // Refresh the page data so changes show immediately
    revalidatePath('/test-navbar');
    
    return { success: true };
  } catch (error) {
    console.error('Error updating JSON:', error);
    return { success: false, error: 'Failed to update status' };
  }
}