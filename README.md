# Favicon proxy

This service allows to load favicon for any website with CORS headers.
Usage: GET /domain.com  
It doesn't convert the icon to PNG format, just adds CORS headers to enable favicon display on any website.  
Ready for OpenShift.

## Example

https://favicon-antelle.rhcloud.com/apple.com

## Alternatives

- http://www.google.com/s2/favicons?domain=www.apple.com
- http://favicon.yandex.net/favicon/apple.com
- https://icons.duckduckgo.com/ip2/apple.com

## Usage

Please, don't use my app instance if you need frequent requests: deploy your own one.

## License

MIT
