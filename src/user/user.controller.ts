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
.get("/user/me", async ({ payload, set }) => {
    const row = await userService.getProfileById({
      id:payload.id
    })
    const me = row?.[0];
    if(!row) {
      set.status = 404;
      return {
        success: false,
        error: "User not found", 
        data: null
      }
    }

    return {
      success: true,
      data: me
    }
}, {
  auth: true
})
.patch("/user/update", async ({ payload, body, set }) => {
  try {
    const updated = await userService.updateProfileById({
      id: payload.id,
      name: body.name,
      email: body.email,
    });
    if (!updated) {
      set.status = 404;
      return { 
        success: false, 
        error: "User not found", data: null 
      };
    }
    return { 
      success: true, 
      data: updated 
    };
  } catch (e: any) {
    const msg = e?.message || "Update failed";
    if (e?.code === "EMAIL_TAKEN") {
      set.status = 409;
    } else {
      set.status = 500;
    }
    return { success: false, error: msg, data: null };
  }
}, {
  auth: true,
  body: t.Object({
    name: t.String({ minLength: 1 }),   // ใส่เฉพาะฟิลด์ที่อยากเปลี่ยน
    email: t.String({ minLength: 3 }),  // (ปล่อย validation ลึก ๆ ที่ frontend เพิ่ม)
  })
})