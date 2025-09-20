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
}