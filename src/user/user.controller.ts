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
        callbackURL: process.env.FRONTEND_URL
      },  
      asResponse: false            
    });
  })
.get("/signin/roblox", async() => {
  const data = await auth.api.signInSocial({
    body: {
      provider: "roblox",
      callbackURL: process.env.FRONTEND_URL
    },
    asResponse: false
  });
  return data;
})
.post("/signup/email", async ({ body }) => {
  const data = await auth.api.signUpEmail({
    body: {
      name: body.name,
      email: body.email,
      password: body.password,
      image: body.image,
      //callbackURL: process.env.FRONTEND_URL
    }
  });
  return data;
}, {
    body: t.Object({
      name: t.String(),
      email: t.String(),
      password: t.String(),
      image: t.Optional(t.String()),
      callbackURL: t.Optional(t.String())
    })
})
.post("/singin/email", async ({ body }) => {
  const data = await auth.api.signInEmail({
    body: {
      email: body.email,
      password: body.password,
      //callbackURL: process.env.FRONTEND_URL
    }
  });
  return data;
}, {
  body: t.Object({
    email: t.String(),
    password: t.String(),
    callbackURL: t.Optional(t.String())
  })
})
.post("/signout", async (request) => {
  await auth.api.signOut({
    headers: request.headers as any,
    asResponse: false
  });
  return {
    success: true,
    message: "Sign out successful"
  }
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