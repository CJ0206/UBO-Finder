# UBO-Finder <a href='https://ko-fi.com/christianjameswatkins' target='_blank'><img height='35' align='right' style='border:0px;height:46px;' src='https://storage.ko-fi.com/cdn/kofi1.png?v1' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>
This code usises Nginx as a host, and the UK Companies House API to search recursively for the UBO/PSC structure of a company using its Companies House number.

The results returned will be limited to the data quality contained within Copmpanies House, I have tried to mitigate issues I have found within the [ubo.js](ubo.js) code but I can't mitigate for all of their data quality issues.

If there is no PSC on Companies House, or the structure goes to a forreign registered entity the recursive search will end and an appropriate message should be displayed.

The data returned will be displayed within the web console, so feel free to inspect the webpage, this will be cleared if the `Reset` button is clicked.

When exporting to a .csv the data is split using `,`, so any `,` within the data returned may result in additional columns, this is less of an issue in the .pdf export which convets the table displayed on the webpage into a table within the pdf, although the page numbering is inconsistent as it tries to calculate the number of pages when generating the .pdf (you may see `1/1`, `2/2`, etc. instead of `1/2`, `2/2`, etc.).

## Setting up the API

You will need to generate your own [Companies House API key](https://developer.company-information.service.gov.uk/get-started) and convert it to Base64

```
echo -n "YOUR_API_KEY:" | base64
```

When you have your converted key you will need to add it to your Nginx configuration:
```
    # Proxy API requests and add authentication
    location /companies-house-api/ {
        proxy_pass https://api.company-information.service.gov.uk/;
        proxy_set_header Host api.company-information.service.gov.uk;
        proxy_set_header Authorization "Basic AAAaAAA0AaAaAAAaAA00A0A0AAa00aAaAAAaAaAaAAA0AAaaAa==";  # Use your actual Base64-encoded API key

        # Allow CORS
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods "GET, OPTIONS";
        add_header Access-Control-Allow-Headers "Authorization, Content-Type";

        # Handle preflight requests
        if ($request_method = OPTIONS) {
            return 204;
        }
    }
```

You can test this is working by running the following (replacing `AAAaAAA0AaAaAAAaAA00A0A0AAa00aAaAAAaAaAaAAA0AAaaAa` with your converted API key, and `http://192.168.1.111:8083` with your Nginx address):

```
curl -H "Authorization: Basic AAAaAAA0AaAaAAAaAA00A0A0AAa00aAaAAAaAaAaAAA0AAaaAa==" "http://192.168.1.111:8083/companies-house-api/company/09601776/persons-with-significant-control"
```

You should see an output similar to the below:
```
{"items_per_page":25,"items":[{"etag":"dab20106b703c0a978b7ec2b08399177c032030c","notified_on":"2017-05-20","country_of_residence":"United Kingdom","date_of_birth":{"month":3,"year":1983},"name":"Mr Pragnesh Modhwadia","name_elements":{"title":"Mr","surname":"Modhwadia","forename":"Pragnesh"},"links":{"self":"/company/09601776/persons-with-significant-control/individual/ThVvY0C_rPpkADN2R1jmeMkWDVc"},"nationality":"British","ceased":false,"kind":"individual-person-with-significant-control","address":{"address_line_1":"248a Marylebone Road","locality":"London","postal_code":"NW1 6BB","premises":"5th Floor  Grove House"},"natures_of_control":["ownership-of-shares-75-to-100-percent","voting-rights-75-to-100-percent"]}],"start_index":0,"total_results":1,"active_count":1,"ceased_count":0,"links":{"self":"/company/09601776/persons-with-significant-control"}}
```

## [index.html](index.html)

Please ensure you update the `<!-- Footer -->` section with your contact details (you may also want to remove my ko-fi link, but if you leave it there it would also be appreciated).

### If you use Google Analytics:

You will need to update the `script.src` with you tag URL (i.e. replaye `...`):
```
// Google tag (gtag.js)
        (function() {
            var script = document.createElement('script');
            script.async = true;
            script.src = "...";
            document.head.appendChild(script);
        })();
```

You will also need to update your gtag (i.e. replaye `...`):
```
        gtag('js', new Date());
        gtag('config', '...');
```

### If you do not use Google Analytics:

Remove the entire `<script>` section at the top of the code, and the `<!--- Google Analytic Consent --->` section at the bottom of the code.

## [ubo.js](ubo.js)

Replace `[BASE_URL]` in `ubo.js` with your base url (e.g. [ch.cjspi.co.uk](https://ch.cjspi.co.uk/)):
```
const BASE_URL = "https://[BASE_URL]/companies-house-api"; 
```

If you update the introduction in [index.html](index.html) you will also need to update `function resetForm()` in `ubo.js`.

You may also want to update `patchNotes()` to reflect any changes you make, I have tried to keep track of each of the changes I have made and iterate the version number as appropriate.
