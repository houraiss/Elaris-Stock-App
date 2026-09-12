CREATE TABLE `materials` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`synced_at` text,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`purity` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `materials_code_unique` ON `materials` (`code`);--> statement-breakpoint
CREATE TABLE `markup_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`synced_at` text,
	`material_id` text,
	`min_weight_mg` integer NOT NULL,
	`max_weight_mg` integer NOT NULL,
	`markup_bps` integer NOT NULL,
	`effective_from` text NOT NULL,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pieces` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`synced_at` text,
	`name` text NOT NULL,
	`sku` text,
	`category` text NOT NULL,
	`material_id` text NOT NULL,
	`item_type` text NOT NULL,
	`variant_type` text NOT NULL,
	`default_cost_centimes` integer,
	`notes` text,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pieces_sku_unique` ON `pieces` (`sku`);--> statement-breakpoint
CREATE TABLE `variants` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`synced_at` text,
	`piece_id` text NOT NULL,
	`label` text NOT NULL,
	`sku` text,
	`barcode` text,
	`nominal_weight_mg` integer NOT NULL,
	`cost_centimes` integer NOT NULL,
	`price_centimes` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`piece_id`) REFERENCES `pieces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `variants_sku_unique` ON `variants` (`sku`);--> statement-breakpoint
CREATE UNIQUE INDEX `variants_barcode_unique` ON `variants` (`barcode`);--> statement-breakpoint
CREATE TABLE `piece_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`synced_at` text,
	`piece_id` text NOT NULL,
	`uri` text NOT NULL,
	`remote_url` text,
	`embedding` text,
	`is_primary` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`piece_id`) REFERENCES `pieces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `scan_events` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`synced_at` text,
	`captured_uri` text NOT NULL,
	`method` text NOT NULL,
	`matched_variant_id` text,
	`confidence` real,
	`confirmed` integer DEFAULT false NOT NULL,
	`occurred_at` text NOT NULL,
	FOREIGN KEY (`matched_variant_id`) REFERENCES `variants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`synced_at` text,
	`display_name` text NOT NULL,
	`phone_e164` text,
	`instagram_handle` text,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`synced_at` text,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`phone_e164` text,
	`city` text,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`synced_at` text,
	`supplier_id` text NOT NULL,
	`reference` text,
	`occurred_at` text NOT NULL,
	`total_centimes` integer NOT NULL,
	`due_on` text,
	`note` text,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `purchase_items` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`synced_at` text,
	`purchase_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`qty` integer NOT NULL,
	`weight_mg` integer NOT NULL,
	`unit_cost_centimes` integer NOT NULL,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `supplier_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`synced_at` text,
	`supplier_id` text NOT NULL,
	`purchase_id` text,
	`amount_centimes` integer NOT NULL,
	`method` text NOT NULL,
	`paid_on` text NOT NULL,
	`note` text,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `custom_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`synced_at` text,
	`customer_id` text NOT NULL,
	`craftsman_supplier_id` text,
	`description` text NOT NULL,
	`reference_photo_uri` text,
	`material_id` text NOT NULL,
	`target_size` text,
	`target_weight_mg` integer,
	`quoted_price_centimes` integer NOT NULL,
	`agreed_cost_centimes` integer,
	`status` text NOT NULL,
	`ordered_on` text,
	`promised_on` text,
	`delivered_on` text,
	`note` text,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`craftsman_supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sales` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`synced_at` text,
	`channel` text NOT NULL,
	`location_label` text,
	`customer_id` text,
	`subtotal_centimes` integer NOT NULL,
	`discount_centimes` integer DEFAULT 0 NOT NULL,
	`total_centimes` integer NOT NULL,
	`payment_terms` text NOT NULL,
	`status` text NOT NULL,
	`occurred_at` text NOT NULL,
	`handed_over_at` text,
	`due_on` text,
	`note` text,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sale_items` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`synced_at` text,
	`sale_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`qty` integer NOT NULL,
	`weight_mg_actual` integer NOT NULL,
	`unit_cost_centimes` integer NOT NULL,
	`markup_pct_applied` integer NOT NULL,
	`unit_price_centimes` integer NOT NULL,
	`discount_centimes` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `customer_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`synced_at` text,
	`sale_id` text,
	`custom_order_id` text,
	`customer_id` text NOT NULL,
	`amount_centimes` integer NOT NULL,
	`method` text NOT NULL,
	`paid_on` text NOT NULL,
	`note` text,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`custom_order_id`) REFERENCES `custom_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`synced_at` text,
	`variant_id` text NOT NULL,
	`type` text NOT NULL,
	`qty_delta` integer NOT NULL,
	`weight_mg` integer,
	`unit_cost_centimes` integer NOT NULL,
	`reason` text,
	`occurred_at` text NOT NULL,
	`sale_id` text,
	`purchase_id` text,
	`custom_order_id` text,
	FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`custom_order_id`) REFERENCES `custom_orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`synced_at` text,
	`variant_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`qty` integer NOT NULL,
	`status` text NOT NULL,
	`expires_at` text,
	FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `post_pieces` (
	`post_id` text NOT NULL,
	`piece_id` text NOT NULL,
	PRIMARY KEY(`post_id`, `piece_id`),
	FOREIGN KEY (`post_id`) REFERENCES `social_posts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`piece_id`) REFERENCES `pieces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `social_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`synced_at` text,
	`platform` text NOT NULL,
	`external_id` text,
	`permalink` text,
	`posted_at` text NOT NULL,
	`caption` text,
	`likes` integer DEFAULT 0 NOT NULL,
	`comments` integer DEFAULT 0 NOT NULL,
	`shares` integer DEFAULT 0 NOT NULL,
	`saves` integer DEFAULT 0 NOT NULL,
	`views` integer DEFAULT 0 NOT NULL,
	`source` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `social_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`synced_at` text,
	`platform` text NOT NULL,
	`captured_on` text NOT NULL,
	`followers` integer NOT NULL,
	`posts_count` integer NOT NULL,
	`reach` integer,
	`profile_views` integer,
	`source` text NOT NULL
);
