import Elysia, { t } from "elysia";
import { auth } from "lib/auth";
import { betterAuth } from "lib/auth-macro";
import { userService } from "./user.service";

export const UserController = new Elysia({
    name: "user.controller",
    prefix: "/auth"
})
.use(betterAuth) // using better-auth macro
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
.patch("/user", async ({ body, payload }) => { // example endpoint and using "payload" from better-auth macro

    await userService.getUserById({
        id: payload.id,
        email: payload.email
    })

    return {
        success: true,
        message: "User update Successful"
    }
}, {
    body: t.Object({
        phone_number: t.String()
    }),
    auth: true // this line enables better-auth macro
})