<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Server-side validation. Collects every field error, then fails once with
 * all of them, so the form can mark each field:
 *
 *   $v = new Validator($request->body());
 *   $email = $v->email('email');
 *   $qty   = $v->int('quantity', 1, 10);
 *   $v->done();   // throws 422 with { fields: { email: '...', quantity: '...' } }
 */
final class Validator
{
    private array $errors = [];

    public function __construct(private readonly array $data)
    {
    }

    public function fail(string $field, string $message): void
    {
        $this->errors[$field] ??= $message;
    }

    public function string(string $field, string $label, int $min = 1, int $max = 255, bool $required = true): ?string
    {
        $value = $this->data[$field] ?? null;
        if ($value === null || (is_string($value) && trim($value) === '')) {
            if ($required) {
                $this->fail($field, "Enter {$label}.");
            }
            return null;
        }
        if (!is_string($value) && !is_numeric($value)) {
            $this->fail($field, "Enter {$label} as text.");
            return null;
        }
        $value = trim((string) $value);
        $length = mb_strlen($value);
        if ($length < $min) {
            $this->fail($field, ucfirst($label) . " must be at least {$min} characters.");
        } elseif ($length > $max) {
            $this->fail($field, ucfirst($label) . " must be {$max} characters or fewer.");
        }
        return $value;
    }

    public function email(string $field): ?string
    {
        $value = $this->string($field, 'an email address', 3, 100);
        if ($value !== null && !filter_var($value, FILTER_VALIDATE_EMAIL)) {
            $this->fail($field, 'Enter an email address like name@example.com.');
        }
        return $value !== null ? strtolower($value) : null;
    }

    public function password(string $field, string $label = 'a password'): ?string
    {
        $value = $this->data[$field] ?? null;
        if (!is_string($value) || $value === '') {
            $this->fail($field, "Enter {$label}.");
            return null;
        }
        if (strlen($value) < 8) {
            $this->fail($field, 'Use at least 8 characters.');
        } elseif (strlen($value) > 128) {
            $this->fail($field, 'Use 128 characters or fewer.');
        }
        return $value;
    }

    public function int(string $field, int $min, int $max, string $label = 'a number', bool $required = true): ?int
    {
        $value = $this->data[$field] ?? null;
        if ($value === null || $value === '') {
            if ($required) {
                $this->fail($field, "Enter {$label}.");
            }
            return null;
        }
        if (!is_int($value) && !(is_string($value) && preg_match('/^-?\d+$/', $value))) {
            $this->fail($field, "Enter {$label} as a whole number.");
            return null;
        }
        $value = (int) $value;
        if ($value < $min || $value > $max) {
            $this->fail($field, ucfirst($label) . " must be between {$min} and {$max}.");
        }
        return $value;
    }

    public function money(string $field, string $label, float $min = 0.01, float $max = 99999.99): ?string
    {
        $value = $this->data[$field] ?? null;
        if (!is_numeric($value)) {
            $this->fail($field, "Enter {$label} as an amount, like 49.00.");
            return null;
        }
        $number = round((float) $value, 2);
        if ($number < $min || $number > $max) {
            $this->fail($field, ucfirst($label) . ' must be between ' . number_format($min, 2) . ' and ' . number_format($max, 2) . '.');
        }
        return number_format($number, 2, '.', '');
    }

    public function choice(string $field, array $allowed, string $label, ?string $default = null): ?string
    {
        $value = $this->data[$field] ?? $default;
        if (!is_string($value) || !in_array($value, $allowed, true)) {
            $this->fail($field, "Choose {$label}.");
            return null;
        }
        return $value;
    }

    public function bool(string $field, bool $default = false): bool
    {
        $value = $this->data[$field] ?? $default;
        return $value === true || $value === 1 || $value === '1' || $value === 'true';
    }

    public function done(): void
    {
        if ($this->errors) {
            $count = count($this->errors);
            throw HttpError::badRequest($count === 1 ? reset($this->errors) : "Check the {$count} highlighted fields.", $this->errors);
        }
    }
}
