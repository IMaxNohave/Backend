import {
  mysqlTable,
  timestamp,
  varchar,
  boolean,
  text,
  decimal,
  int,
  json,
} from "drizzle-orm/mysql-core";

export const user = mysqlTable("user", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: text("name").notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"),
  user_type: int("user_type").notNull().default(1), // 1=user, 2=admin
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const session = mysqlTable("session", {
  id: varchar("id", { length: 36 }).primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = mysqlTable("account", {
  id: varchar("id", { length: 36 }).primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verification = mysqlTable("verification", {
  id: varchar("id", { length: 36 }).primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const jwks = mysqlTable("jwks", {
  id: varchar("id", { length: 36 }).primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: timestamp("created_at").notNull(),
});

export const category = mysqlTable("category", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  detail: text("detail"),
  isActive: boolean("is_active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const item = mysqlTable("item", {
  id: varchar("id", { length: 36 }).primaryKey(),
  sellerId: varchar("seller_id", { length: 36 }).references(() => user.id, {
    onDelete: "cascade",
  }),
  name: varchar("name", { length: 255 }).notNull(),
  detail: text("detail"),
  categoryId: varchar("category_id", { length: 36 }).references(
    () => category.id,
    { onDelete: "cascade" }
  ),
  image: text("image"),
  price: decimal("price", { precision: 12, scale: 2 }).notNull(),
  quantity: int("quantity").notNull(),
  isActive: boolean("is_active").notNull(),
  status: int("status").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const orders = mysqlTable("orders", {
  id: varchar("id", { length: 36 }).primaryKey(),
  itemId: varchar("item_id", { length: 36 })
    .notNull()
    .references(() => item.id, { onDelete: "cascade" }),
  sellerId: varchar("seller_id", { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  buyerId: varchar("buyer_id", { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  quantity: int("quantity").notNull(),
  priceAtPurchase: decimal("price_at_purchase", {
    precision: 12,
    scale: 2,
  }).notNull(),
  total: decimal("total", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull(),
  deadlineAt: timestamp("deadline_at", { fsp: 3 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const orderEvent = mysqlTable("order_event", {
  id: varchar("id", { length: 36 }).primaryKey(),
  orderId: varchar("order_id", { length: 36 })
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  actorId: varchar("actor_id", { length: 36 }).references(() => user.id, {
    onDelete: "cascade",
  }),
  // quantity: int("quantity").notNull(),
  type: text("type").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const orderConfirm = mysqlTable("order_confirm", {
  orderId: varchar("order_id", { length: 36 })
    .primaryKey()
    .references(() => orders.id, { onDelete: "cascade" }),
  sellerConfirmedAt: timestamp("seller_confirmed_at", { fsp: 3 }),
  buyerConfirmedAt: timestamp("buyer_confirmed_at", { fsp: 3 }),
});

export const dispute = mysqlTable("dispute", {
  id: varchar("id", { length: 36 }).primaryKey(),
  orderId: varchar("order_id", { length: 36 })
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  openedBy: varchar("opened_by", { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  reasonCode: text("reason_code").notNull(),
  bondAmount: decimal("bond_amount", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  status: text("status").notNull().default("OPEN"),
  autoVerdict: text("auto_verdict"),
  resolvedBy: varchar("resolved_by", { length: 36 }).references(() => user.id, {
    onDelete: "set null",
  }),
  resolvedAt: timestamp("resolved_at", { fsp: 3 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const evidence = mysqlTable("evidence", {
  id: varchar("id", { length: 36 }).primaryKey(),
  orderId: varchar("order_id", { length: 36 })
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  byUserId: varchar("by_user_id", { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  isVideo: boolean("is_video").notNull(),
  url: text("url").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const orderMessage = mysqlTable("order_message", {
  id: varchar("id", { length: 36 }).primaryKey(),
  orderId: varchar("order_id", { length: 36 })
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  senderId: varchar("sender_id", { length: 36 }).references(() => user.id, {
    onDelete: "set null",
  }), // null = SYSTEM
  kind: text("kind").notNull(),
  body: text("body"),
  isDeleted: boolean("is_deleted").notNull().default(false),
  isHidden: boolean("is_hidden").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const wallet = mysqlTable("wallet", {
  userId: varchar("user_id", { length: 36 })
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  balance: decimal("balance", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  held: decimal("held", { precision: 14, scale: 2 }).notNull().default("0"),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const actionType = mysqlTable("action_type", {
  id: varchar("id", { length: 36 }).primaryKey(),
  actionName: varchar("action_name", { length: 64 }).notNull(),
});

export const walletTx = mysqlTable("wallet_tx", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  orderId: varchar("order_id", { length: 36 }).references(() => orders.id, {
    onDelete: "set null",
  }),
  holdId: varchar("hold_id", { length: 32 }).references(() => walletHold.id, {
    onDelete: "cascade",
  }),
  action: varchar("action", { length: 32 })
    .notNull()
    .references(() => actionType.id, { onDelete: "cascade" }),

  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const walletHold = mysqlTable("wallet_hold", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  orderId: varchar("order_id", { length: 36 })
    .notNull()
    .references(() => orders.id, {
      onDelete: "cascade",
    }),
  status: int("status").notNull().default(1),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const depositRequest = mysqlTable("deposit_request", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 8 }).notNull().default("THB"),
  provider: varchar("provider", { length: 64 }).notNull(),
  slipUrl: text("slip_url").notNull(),
  slipRef: varchar("slip_ref", { length: 128 }).notNull().unique(),
  status: text("status").notNull().default("PENDING"),
  idempotencyKey: varchar("idempotency_key", { length: 128 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const withdrawRequest = mysqlTable("withdraw_request", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 8 }).notNull().default("THB"),
  method: text("method").notNull().default("BANK"),
  accountInfo: json("account_info").notNull(), // {"bank":"SCB","accountNo":"xxx",...} หรือ {"promptpay":"08xxxx"}
  status: text("status").notNull().default("PENDING"),
  failureCode: varchar("failure_code", { length: 64 }),
  failureReason: text("failure_reason"),
  processedBy: varchar("processed_by", { length: 36 }).references(
    () => user.id,
    { onDelete: "set null" }
  ),
  processedAt: timestamp("processed_at", { fsp: 3 }).defaultNow(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
