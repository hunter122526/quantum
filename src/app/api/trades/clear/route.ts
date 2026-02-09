import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const FILE_PATH = path.join(process.cwd(), ".alice.incoming.json");

export async function DELETE() {
  try {
    if (fs.existsSync(FILE_PATH)) {
      fs.writeFileSync(FILE_PATH, "[]", "utf-8"); // reset file
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Clear trades error:", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
