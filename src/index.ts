import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import openapi from "@elysiajs/openapi";
import { auth } from "lib/auth";
// Import routes
import { salesRoutes } from "./routes/sales";
import { creditsRoutes } from "./credits/credits";
import { profileRoutes } from "./routes/profile";
import { loginRoutes } from "./routes/login";
import { ordersRoutes } from "./routes/orders";
import { balanceRoutes } from "./routes/balance";
import { UserController } from "user/user.controller";
import { uploadR2 } from "upload-r2/upload-r2";
import { HomeController } from "home/home.controller";
import { ItemsController } from "item/items.controller";
import { OrdersController } from "order/orders.controller";
import { AdminController } from "admin/admin.controller";

const app = new Elysia()
  .mount(auth.handler)
  .use(cors())
  .use(
    swagger({
      documentation: {
        info: {
          title: "Marketplace API",
          version: "1.0.0",
          description: "Complete E-commerce marketplace API",
        },
      },
    }) as any
  )
  .use(openapi())

  .use(UserController)
  .use(HomeController)
  .use(uploadR2)
  .use(ItemsController)
  .use(OrdersController)
  .use(AdminController)
  // i jao nay tum yang mai dai edit
  .use(salesRoutes)
  .use(creditsRoutes)
  .use(profileRoutes)
  .use(loginRoutes)
  //.use(ordersRoutes)
  .use(balanceRoutes)

  .get("/", () => "Hello Elysia")
  .listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
