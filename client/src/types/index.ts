export type UserRole = 'admin' | 'staff';

export interface User {
  id: number;
  username: string;
  full_name: string;
  role: UserRole;
  phone?: string;
  status: 'active' | 'inactive';
  created_at?: string;
  updated_at?: string;
}

export interface ShopSettings {
  id: number;
  shop_name: string;
  tagline: string;
  logo_url: string;
  address: string;
  location: string;
  city: string;
  district: string;
  state: string;
  state_code: string;
  pincode: string;
  contact_number: string;
  alt_contact?: string;
  email: string;
  gstin: string;
  invoice_prefix: string;
  invoice_starting_number: number;
  qr_code_url: string;
  upi_id: string;
  upi_payee_name?: string;
  thermal_paper_width?: '58mm' | '80mm';
  qr_mode?: 'dynamic' | 'static';
  footer_text: string;
  terms_conditions: string;
  created_at?: string;
  updated_at?: string;
}

export type TextileUnit = 'Pieces' | 'Meters' | 'Yards' | 'Kilograms' | 'Sets' | 'Rolls' | 'Dozens';

export interface Category {
  id: number;
  name: string;
  description?: string;
  hsn_default?: string;
  gst_default?: number;
  product_count?: number;
  created_at?: string;
}

export interface Product {
  id: number;
  name: string;
  sku: string;
  barcode?: string;
  category_id?: number;
  category_name?: string;
  category_display_name?: string;
  hsn_code: string;
  unit: TextileUnit;
  purchase_price: number;
  selling_price: number;
  is_tax_inclusive: number | boolean;
  gst_rate: number;
  stock_quantity: number;
  min_stock_alert: number;
  supplier?: string;
  description?: string;
  status: 'active' | 'inactive';
  created_at?: string;
  updated_at?: string;
}

export interface Customer {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  state_code?: string;
  gstin?: string;
  total_purchases: number;
  total_bills: number;
  outstanding_balance: number;
  last_purchase_date?: string;
  created_at?: string;
  updated_at?: string;
}

export interface InvoiceItem {
  id?: number;
  invoice_id?: number;
  product_id?: number;
  product_name: string;
  sku?: string;
  hsn_code: string;
  category_name?: string;
  unit: TextileUnit;
  quantity: number;
  rate: number;
  discount_type: 'flat' | 'percent';
  discount_value: number;
  discount_amount: number;
  taxable_amount: number;
  gst_rate: number;
  is_inter_state?: number | boolean;
  cgst_rate: number;
  cgst_amount: number;
  sgst_rate: number;
  sgst_amount: number;
  igst_rate: number;
  igst_amount: number;
  total_tax: number;
  final_amount: number;
  is_tax_inclusive?: boolean | number;
}

export type PaymentMethod = 'cash' | 'upi' | 'card' | 'bank_transfer' | 'credit' | 'split';
export type PaymentStatus = 'paid' | 'partial' | 'unpaid';
export type InvoiceStatus = 'active' | 'cancelled' | 'refunded';

export interface PaymentRecord {
  id?: number;
  invoice_id?: number;
  customer_id?: number;
  payment_date: string;
  payment_method: string;
  amount: number;
  reference_number?: string;
  notes?: string;
  received_by_user_id?: number;
  received_by_name?: string;
  invoice_number?: string;
  customer_name_linked?: string;
}

export interface RefundRecord {
  id: number;
  invoice_id: number;
  refund_number: string;
  refund_date: string;
  customer_id?: number;
  customer_name?: string;
  refund_type: 'full' | 'partial';
  taxable_refund_amount: number;
  cgst_refund: number;
  sgst_refund: number;
  igst_refund: number;
  total_tax_refund: number;
  total_refund_amount: number;
  refund_payment_method: string;
  restock_inventory: number;
  reason: string;
  created_at?: string;
}

export interface Invoice {
  id: number;
  invoice_number: string;
  invoice_date: string;
  invoice_time: string;
  customer_id?: number;
  customer_name: string;
  customer_phone?: string;
  customer_address?: string;
  customer_gstin?: string;
  place_of_supply: string;
  place_of_supply_code: string;
  is_inter_state: number;
  total_items_count: number;
  subtotal_raw: number;
  total_product_discount: number;
  bill_discount_type: 'flat' | 'percent';
  bill_discount_value: number;
  total_bill_discount: number;
  total_taxable_amount: number;
  total_cgst: number;
  total_sgst: number;
  total_igst: number;
  total_tax_amount: number;
  round_off: number;
  grand_total: number;
  amount_paid: number;
  balance_due: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  status: InvoiceStatus;
  cancel_reason?: string;
  cancelled_at?: string;
  notes?: string;
  billed_by_user_id?: number;
  billed_by_name?: string;
  items?: InvoiceItem[];
  payments?: PaymentRecord[];
  refunds?: RefundRecord[];
  shop?: ShopSettings;
  amount_in_words?: string;
  created_at?: string;
}

export interface Expense {
  id: number;
  category: string;
  title: string;
  amount: number;
  expense_date: string;
  payment_method: string;
  receipt_number?: string;
  notes?: string;
  created_by_user_id?: number;
  created_by_name?: string;
  created_at?: string;
}

export interface AuditLog {
  id: number;
  user_id?: number;
  user_name: string;
  action: string;
  entity_type?: string;
  entity_id?: string;
  details?: string;
  ip_address?: string;
  created_at: string;
}

export interface InventoryTransaction {
  id: number;
  product_id: number;
  product_name: string;
  transaction_type: string;
  quantity: number;
  quantity_before: number;
  quantity_after: number;
  unit: string;
  reference_id?: string;
  reason?: string;
  created_by_user_id?: number;
  user_name?: string;
  created_at: string;
}

