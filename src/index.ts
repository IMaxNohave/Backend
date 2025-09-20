import openapi from "@elysiajs/openapi";
import { Elysia } from "elysia";
import { auth } from "lib/auth";

const app = new Elysia()
.mount(auth.handler) 
.use(openapi())
.get("/", () => "Hello Elysia")
.get("/signin/google", async () => {
     return await auth.api.signInSocial({
      body: { 
        provider: "google",
        callbackURL: "http://localhost:3000"
      },  
      asResponse: true            
    });
  })
.get("/signin/roblox", async() => {
  const data = await auth.api.signInSocial({
    body: {
      provider: "roblox",
      callbackURL: "http://localhost:3000"
    },
    asResponse: true
  });
  return data;
})
.listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
