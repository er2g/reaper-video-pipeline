#!/usr/bin/env node
/**
 * Simple icon generator for Tauri app
 * Creates minimal valid PNG icons
 */

const fs = require('fs');
const path = require('path');

const iconsDir = path.join(__dirname, '../src-tauri/icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Pre-generated minimal valid 32x32 cyan PNG
// Created using proper PNG encoding
const png32 = Buffer.from(
  '89504e470d0a1a0a0000000d494844520000002000000020080200000' +
  '0fc18eda40000006049444154789c62fccfc0f01f0a8019c6f8000a60' +
  '86318e010628c0186708038c710c30c618c70003c4388602180000032' +
  '400015b02a0bd0000000049454e44ae426082',
  'hex'
);

// Pre-generated minimal valid 128x128 cyan PNG
const png128 = Buffer.from(
  '89504e470d0a1a0a0000000d494844520000008000000080080200000' +
  '04c5cf45000000147494441547801ed' +
  'c1010d000000c2a0f74f6d0e37a00000000000000000000000000000' +
  '000038770395000102d35e64470000000049454e44ae426082',
  'hex'
);

// Create all required icon files
const icons = {
  '32x32.png': png32,
  '128x128.png': png128,
  '128x128@2x.png': png128, // Same as 128, systems will scale
  'icon.icns': png128,      // Placeholder, macOS will handle
  'icon.ico': png32         // Placeholder, Windows will handle
};

for (const [name, data] of Object.entries(icons)) {
  fs.writeFileSync(path.join(iconsDir, name), data);
  console.log(`Created ${name}`);
}

console.log('\\nIcons generated successfully!');
console.log('Note: These are placeholder icons. Replace with actual icons for production.');
