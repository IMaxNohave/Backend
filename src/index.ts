import { cors } from "@elysiajs/cors";
import openapi from "@elysiajs/openapi";
import { Elysia } from "elysia";
import { auth } from "lib/auth";
import { UserController } from "user/user.controller";

const app = new Elysia()
.use(cors())
.mount(auth.handler) 
.use(openapi())
.use(UserController)
.get("/", () => "Hello Elysia")

.listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
