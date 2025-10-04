import { dbClient } from "@db/client";
import { user } from "@db/schema";
import { eq } from "drizzle-orm";

export abstract class userService { // example service nothing actually happening here
    static async getUserById({
        id,
        email
    }: {
        id: string;
        email: string;
    }) {
        return await dbClient
            .select()
            .from(user)
            .where(eq(user.id, id))
    }
    static async getProfileById({
        id
    }: {
        id: string;
    }) {
        return await dbClient
            .select()
            .from(user)
            .where(eq(user.id, id))
            .limit(1);
    }
    static async updateProfileById({
        id,
        name,
        email
    }: {
        id: string;
        name: string;
        email: string;
    }) {
         const patch: Partial<typeof user.$inferInsert> = { updatedAt: new Date() };
        if(typeof name ==="string" && name.trim()) patch.name = name.trim();
        if (typeof email === "string" && email.trim()) patch.email = email.trim();

        patch.email = email;
        return await dbClient
            .update(user)
            .set(patch)
            .where(eq(user.id, id));
    }
}