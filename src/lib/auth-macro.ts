import Elysia from "elysia";
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { jwtPayload } from "./type";

export const betterAuth = new Elysia({
    name: "better-auth"
})
.macro({
    auth: {
        async resolve(ctx) {
            const authHeader = ctx.headers["authorization"];
            if (!authHeader) {
                ctx.set.status = 401;
                throw new Error("Error: Missing Authorization Header");
            }

            try {
                const token = authHeader.split(" ")[1];
                const JWKS = createRemoteJWKSet(
                    new URL('http://localhost:3000/api/auth/jwks')
                )
                const { payload } = ( await jwtVerify(token, JWKS, {
                    issuer: "http://localhost:3000",
                    audience: "http://localhost:3000"
                })) as { payload: jwtPayload };
                return {
                    payload: payload
                };
            }
            catch (error) {
                ctx.set.status = 401;
                console.error('Token validation failed:', error)
                throw error;
            }
        }
    }
})
