export interface WebsiteData {
  row_number: number;
  Website: string;
  logoUrl?: string;
  logoShape?: string;
  logoStatus?: "pending" | "success" | "failed";
  logoChecked?: boolean;
}