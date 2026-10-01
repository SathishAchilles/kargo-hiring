import bcrypt from "bcryptjs";

const passcode = process.argv[2];
if (!passcode) {
  console.error("Usage: npm run hash-passcode -- '<passcode>'");
  process.exit(1);
}
console.log(bcrypt.hashSync(passcode, 12));
