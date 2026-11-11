<?php
/**
 * Makes every size of the MyEnterprise logo from the original artwork
 * (public/media/myenterprise-icon-v1.png, the violet "ME" circle):
 *
 *   frontend/src/shared/brand/mark.png     128 × 128, transparent: the mark in the shop and admin headers
 *   frontend/public/favicon.png             64 × 64, transparent: the browser tab icon
 *   frontend/public/apple-touch-icon.png   180 × 180 on the shop's cream: phone home screens
 *   frontend/public/share.jpg             1200 × 630: the preview when a link is shared (logo + hero photo)
 *
 *   php tools/brand/make-icons.php        then npm run build
 */
declare(strict_types=1);

$root = dirname(__DIR__, 2);
$src = imagecreatefrompng("$root/public/media/myenterprise-icon-v1.png");
if (!$src) {
    fwrite(STDERR, "cannot read public/media/myenterprise-icon-v1.png\n");
    exit(1);
}
imagesavealpha($src, true);
[$w, $h] = [imagesx($src), imagesy($src)];

// The circle's bounds: the artwork has a transparent margin around it.
[$x0, $y0, $x1, $y1] = [$w, $h, 0, 0];
for ($y = 0; $y < $h; $y += 2) {
    for ($x = 0; $x < $w; $x += 2) {
        if ((imagecolorat($src, $x, $y) >> 24 & 127) < 64) {
            $x0 = min($x0, $x); $x1 = max($x1, $x);
            $y0 = min($y0, $y); $y1 = max($y1, $y);
        }
    }
}
$side = max($x1 - $x0, $y1 - $y0) + 4;
$cx = ($x0 + $x1) / 2;
$cy = ($y0 + $y1) / 2;

/** A transparent canvas. */
function canvas(int $w, int $h)
{
    $im = imagecreatetruecolor($w, $h);
    imagealphablending($im, false);
    imagesavealpha($im, true);
    imagefill($im, 0, 0, imagecolorallocatealpha($im, 0, 0, 0, 127));
    return $im;
}

/** The circle at $size × $size, shrunk in halves first so small sizes stay sharp. */
function mark($src, float $cx, float $cy, int $side, int $size)
{
    $cur = canvas($side, $side);
    imagecopy($cur, $src, 0, 0, (int) round($cx - $side / 2), (int) round($cy - $side / 2), $side, $side);
    while (imagesx($cur) / 2 >= $size) {
        $n = intdiv(imagesx($cur), 2);
        $next = canvas($n, $n);
        imagecopyresampled($next, $cur, 0, 0, 0, 0, $n, $n, imagesx($cur), imagesy($cur));
        $cur = $next;
    }
    $out = canvas($size, $size);
    imagecopyresampled($out, $cur, 0, 0, 0, 0, $size, $size, imagesx($cur), imagesy($cur));
    return $out;
}

$write = static function ($im, string $rel) use ($root): void {
    @mkdir(dirname("$root/$rel"), 0775, true);
    str_ends_with($rel, '.jpg') ? imagejpeg($im, "$root/$rel", 86) : imagepng($im, "$root/$rel", 9);
    printf("%-40s %4d × %-4d %6.1f KB\n", $rel, imagesx($im), imagesy($im), filesize("$root/$rel") / 1024);
};

$write(mark($src, $cx, $cy, $side, 128), 'frontend/src/shared/brand/mark.png');
$write(mark($src, $cx, $cy, $side, 64), 'frontend/public/favicon.png');

// Home-screen icon: phones draw it on a square, so the circle sits on the shop's cream.
$touch = imagecreatetruecolor(180, 180);
imagefill($touch, 0, 0, imagecolorallocate($touch, 246, 241, 231));
imagealphablending($touch, true);
imagecopy($touch, mark($src, $cx, $cy, $side, 152), 14, 14, 0, 0, 152, 152);
$write($touch, 'frontend/public/apple-touch-icon.png');

// Link preview: the logo on cream beside the home page photograph.
$share = imagecreatetruecolor(1200, 630);
imagefill($share, 0, 0, imagecolorallocate($share, 246, 241, 231));
imagealphablending($share, true);
imagecopy($share, mark($src, $cx, $cy, $side, 280), 160, 175, 0, 0, 280, 280);
$hero = imagecreatefromjpeg("$root/public/media/hero/outfit.jpg");
if ($hero) {
    [$hw, $hh] = [imagesx($hero), imagesy($hero)];
    $tw = 600;
    $sw = (int) round($hh * $tw / 630);
    imagecopyresampled($share, $hero, 600, 0, (int) (($hw - $sw) / 2), 0, $tw, 630, $sw, $hh);
}
$write($share, 'frontend/public/share.jpg');
