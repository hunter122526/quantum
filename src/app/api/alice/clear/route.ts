import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const FILE_PATH = path.join(process.cwd(), ".alice.incoming.json");

export async function DELETE() {
  try {
    fs.writeFileSync(FILE_PATH, "[]", "utf-8");
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to clear trades:", err);
    return NextResponse.json({ success: false });
  }
}
