<?php
/**
 * Crops a photograph to the shop's 4:5 frame and saves it as a JPEG that fits
 * ProductImage (under 512 KB; aimed at about 160 KB to keep the SQL small).
 *
 *   php tools/photos/crop.php in.jpg out.jpg [focusX=0.5] [focusY=0.5] [zoom=1] [ratio=4:5] [maxWidth=1024] [targetKB=160]
 *
 * focusX/focusY (0–1) is the point the crop is centred on. zoom 1 fills the
 * frame (the largest area of the photo in the ratio); above 1 crops tighter; below 1
 * steps back, so a wide product shot (a shoe, a belt) fits whole and the
 * extra space is filled with the photo's own background colour.
 * Transparent pictures are laid on white first.
 *
 * Used by tools/photos/pixabay.mjs pick. GD writes no metadata, so camera
 * and location data never reach the database.
 */
declare(strict_types=1);

[$in, $out] = [$argv[1] ?? '', $argv[2] ?? ''];
$fx = (float) ($argv[3] ?? 0.5);
$fy = (float) ($argv[4] ?? 0.5);
$zoom = (float) ($argv[5] ?? 1);
[$rw, $rh] = array_map('floatval', explode(':', $argv[6] ?? '4:5') + [1 => 0]);
$maxW = (int) ($argv[7] ?? 1024); // product pictures: 1024 × 1280 at most
$target = (int) ($argv[8] ?? 160) * 1024; // quality steps down until the file is this small
if (!is_file($in) || $out === '' || $zoom <= 0.2 || $zoom > 4 || $rw <= 0 || $rh <= 0 || $maxW < 200) {
    fwrite(STDERR, "usage: php crop.php in.jpg out.jpg [focusX] [focusY] [zoom 0.2–4] [ratio w:h] [maxWidth]\n");
    exit(1);
}

const LIMIT = 512 * 1024; // chk_image_bytes

$raw = imagecreatefromstring((string) file_get_contents($in));
if (!$raw) {
    fwrite(STDERR, "not an image: $in\n");
    exit(1);
}
[$w, $h] = [imagesx($raw), imagesy($raw)];

// Flatten onto white (a transparent product shot would otherwise turn black).
$src = imagecreatetruecolor($w, $h);
imagefill($src, 0, 0, imagecolorallocate($src, 255, 255, 255));
imagealphablending($src, true);
imagecopy($src, $raw, 0, 0, 0, 0, $w, $h);

// The photo's background: the average of its four corners.
$sum = [0, 0, 0];
foreach ([[2, 2], [$w - 3, 2], [2, $h - 3], [$w - 3, $h - 3]] as [$px, $py]) {
    $c = imagecolorat($src, $px, $py);
    $sum[0] += ($c >> 16) & 255;
    $sum[1] += ($c >> 8) & 255;
    $sum[2] += $c & 255;
}

// The window in source pixels; it may reach past the photo when zoom < 1.
$cw = min($w, $h * $rw / $rh) / $zoom;
$ch = $cw * $rh / $rw;
$place = static fn (float $focus, float $size, float $span): float => $span <= $size
    ? min(max($focus * $size - $span / 2, 0), $size - $span)
    : ($size - $span) / 2;
$x = $place($fx, $w, $cw);
$y = $place($fy, $h, $ch);

$outW = (int) min($maxW, floor($cw));
$outH = (int) round($outW * $rh / $rw);
$scale = $outW / $cw;
$dst = imagecreatetruecolor($outW, $outH);
imagefill($dst, 0, 0, imagecolorallocate($dst, intdiv($sum[0], 4), intdiv($sum[1], 4), intdiv($sum[2], 4)));

// Copy the part of the window that lies on the photo.
$sx = max(0, $x);
$sy = max(0, $y);
$sw = min($w, $x + $cw) - $sx;
$sh = min($h, $y + $ch) - $sy;
imagecopyresampled($dst, $src,
    (int) round(($sx - $x) * $scale), (int) round(($sy - $y) * $scale),
    (int) round($sx), (int) round($sy),
    (int) round($sw * $scale), (int) round($sh * $scale),
    (int) round($sw), (int) round($sh));
imageinterlace($dst, true);

foreach ([82, 78, 74, 70, 64, 58] as $quality) {
    ob_start();
    imagejpeg($dst, null, $quality);
    $bytes = (string) ob_get_clean();
    if (strlen($bytes) <= $target) break;
}
if (strlen($bytes) > LIMIT) {
    fwrite(STDERR, "still over 512 KB: $in\n");
    exit(1);
}
file_put_contents($out, $bytes);
printf("%d×%d, q%d, %d KB\n", $outW, $outH, $quality, intdiv(strlen($bytes), 1024));
