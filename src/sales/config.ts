// src/routes/config.ts
export function computeItemExpiresAt(args: {
  price: number;
  categoryId: string;
}) {
  // ฐานเวลา (นาที) คุมจาก ENV; ดีฟอลต์ 24 ชม.
  const baseMin = parseInt(process.env.ITEM_EXPIRE_MIN ?? "1440", 10);

  // ถ้าจะปรับตามราคา/หมวดหมู่ ก็ทำตรงนี้ได้
  // ตัวอย่างง่าย ๆ: ของแพงอยู่นานกว่า
  const adjMin =
    args.price >= 10000
      ? Math.round(baseMin * 2)
      : args.price >= 1000
      ? Math.round(baseMin * 1.5)
      : baseMin;

  return new Date(Date.now() + adjMin * 60 * 1000);
}
