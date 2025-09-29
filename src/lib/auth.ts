import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt } from "better-auth/plugins";
import { dbClient } from "@db/client"; // your drizzle instance
import { account, jwks, session, user, verification } from "@db/schema";

export const auth = betterAuth({
    database: drizzleAdapter(dbClient, {
        provider: "mysql", // or "mysql", "sqlite"
        schema: {
            user,
            account,
            session,
            verification,
            jwks
        }
    }),
    
    emailAndPassword: {
        enabled: true, 
    }, 
    socialProviders: {
        google: { 
            clientId: process.env.GOOGLE_CLIENT_ID as string, 
            clientSecret: process.env.GOOGLE_CLIENT_SECRET as string, 
        }, 
        roblox: { 
            clientId: process.env.ROBLOX_CLIENT_ID as string, 
            clientSecret: process.env.ROBLOX_CLIENT_SECRET as string, 
        }, 
    },
    plugins: [
        jwt({
            jwt: {
                definePayload: ({ user }) => { 
                    return { 
                        id: user.id, 
                        email: user.email, 
                        username: user.name 
                    }
                }
            },
            jwks: {
                disablePrivateKeyEncryption: true
            }
        })
    ]
});