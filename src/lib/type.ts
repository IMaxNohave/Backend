export type jwtPayload = {
    id: string;
    email: string;
    iat: number;
    exp: number;
    sub: string;
    user_type: number;
}