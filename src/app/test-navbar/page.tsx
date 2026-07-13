import fs from 'fs/promises';
import path from 'path';
import Navbar from '@/components/Navbar';
import ReviewButtons from '@/components/ReviewButtons';
import { NavbarData } from '@/actions/navbarActions';

export default async function TestNavbarPage() {
    // 1. Read JSON on the server side
    const jsonPath = path.join(process.cwd(), 'src', 'data', 'test.json');
    const fileContents = await fs.readFile(jsonPath, 'utf8');
    const data: NavbarData[] = JSON.parse(fileContents);
    
    // 2. Filter out items that are already 'approved' or 'not_approved'
    const pendingItems = data.filter(
        (item) => item.logoStatus !== 'approved' && item.logoStatus !== 'not_approved'
    );

    return (
        <main className="min-h-screen pb-20 bg-gray-50">
            <div className="w-full text-center py-8">
                <h1 className="text-3xl font-bold">Navbar Logo Review Tool</h1>
                <p className="text-gray-500 mt-2">
                    Review logos below. Making a decision will remove them from this list.
                </p>
                <p className="text-sm text-blue-600 mt-1 font-medium">
                    Pending items left: {pendingItems.length}
                </p>
            </div>

            <div className="flex flex-col w-full gap-6">
                {pendingItems.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 font-medium">
                        🎉 All items have been reviewed!
                    </div>
                ) : (
                    pendingItems.map((item) => (
                        <div key={item.row_number} className="w-full relative flex flex-col min-h-[200px]">
                            {/* Background Image */}
                            <img 
                                src='/homeimage.avif' 
                                className="w-full h-full object-cover absolute top-0 left-0 z-0 inset-0" 
                                alt="Home Background" 
                            />
                            
                            {/* Navbar Component Content Wrapper (elevated above background via z-index if needed) */}
                            <div className="relative z-10 w-full flex flex-col justify-between h-full bg-black/10 backdrop-blur-sm">
                                <Navbar logoUrl={item.logoUrl} url={item.Website} />

                                <ReviewButtons
                                    rowNumber={item.row_number}
                                    currentStatus={item.logoStatus}
                                />
                            </div>
                        </div>
                    ))
                )}
            </div>
        </main>
    );
}