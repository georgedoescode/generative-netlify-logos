<img src="./og-image" alt="">

# Generative Netlify Logos With On-demand Builders

An experiment in using Netlify's On-demand builders to create generative assets.

## Usage

A generative logo variant can be requested like so:

```html
<img src="/logos/<seed>/<color_variant>" />
```

- `seed` determines the overall design of a logo. Given the same seed value, our function will always return the same design. Each design has a `ttl` of 7 days.

- `color_variant` is either `dark` or `light` and controls whether the logo has dark (`#`) or light (`#`) lines and nodes.
