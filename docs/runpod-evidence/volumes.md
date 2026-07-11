# List network volumes - Runpod Documentation

**URL:** https://docs.runpod.io/api-reference/network-volumes/GET/networkvolumes

> ## Documentation Index
>
> Fetch the complete documentation index at: [/llms.txt](https://docs.runpod.io/llms.txt)
>
> Use this file to discover all available pages before exploring further.

[Skip to main content](https://docs.runpod.io/api-reference/network-volumes/GET/networkvolumes#content-area)

[Docs](https://docs.runpod.io/overview) [Examples](https://docs.runpod.io/tutorials/introduction/overview) [Community](https://docs.runpod.io/community-solutions/overview) [CLI](https://docs.runpod.io/flash/cli/overview) [API](https://docs.runpod.io/api-reference/overview) [Models](https://docs.runpod.io/public-endpoints/models/flux-dev) [Release notes](https://docs.runpod.io/release-notes)

GET

/

networkvolumes

Try it

List network volumes

cURL

```
curl --request GET \
  --url https://rest.runpod.io/v1/networkvolumes \
  --header 'Authorization: Bearer <token>'
```

```
import requests

url = "https://rest.runpod.io/v1/networkvolumes"

headers = {"Authorization": "Bearer <token>"}

response = requests.get(url, headers=headers)

print(response.text)
```

```
const options = {method: 'GET', headers: {Authorization: 'Bearer <token>'}};

fetch('https://rest.runpod.io/v1/networkvolumes', options)
  .then(res => res.json())
  .then(res => console.log(res))
  .catch(err => console.error(err));
```

```
<?php

$curl = curl_init();

curl_setopt_array($curl, [\
  CURLOPT_URL => "https://rest.runpod.io/v1/networkvolumes",\
  CURLOPT_RETURNTRANSFER => true,\
  CURLOPT_ENCODING => "",\
  CURLOPT_MAXREDIRS => 10,\
  CURLOPT_TIMEOUT => 30,\
  CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,\
  CURLOPT_CUSTOMREQUEST => "GET",\
  CURLOPT_HTTPHEADER => [\
    "Authorization: Bearer <token>"\
  ],\
]);

$response = curl_exec($curl);
$err = curl_error($curl);

curl_close($curl);

if ($err) {
  echo "cURL Error #:" . $err;
} else {
  echo $response;
}
```

```
package main

import (
	"fmt"
	"net/http"
	"io"
)

func main() {

	url := "https://rest.runpod.io/v1/networkvolumes"

	req, _ := http.NewRequest("GET", url, nil)

	req.Header.Add("Authorization", "Bearer <token>")

	res, _ := http.DefaultClient.Do(req)

	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)

	fmt.Println(string(body))

}
```

```
HttpResponse<String> response = Unirest.get("https://rest.runpod.io/v1/networkvolumes")
  .header("Authorization", "Bearer <token>")
  .asString();
```

```
require 'uri'
require 'net/http'

url = URI("https://rest.runpod.io/v1/networkvolumes")

http = Net::HTTP.new(url.host, url.port)
http.use_ssl = true

request = Net::HTTP::Get.new(url)
request["Authorization"] = 'Bearer <token>'

response = http.request(request)
puts response.read_body
```

200

```
[\
  {\
    "dataCenterId": "EU-RO-1",\
    "id": "agv6w2qcg7",\
    "name": "my network volume",\
    "size": 50\
  }\
]
```

#### Authorizations

[​](https://docs.runpod.io/api-reference/network-volumes/GET/networkvolumes#authorization-authorization)

Authorization

string

header

required

Bearer authentication header of the form `Bearer <token>`, where `<token>` is your auth token.

#### Response

200

application/json

Successful operation.

[​](https://docs.runpod.io/api-reference/network-volumes/GET/networkvolumes#response-items-data-center-id)

dataCenterId

string

The Runpod data center ID where a network volume is located.

Example:

`"EU-RO-1"`

[​](https://docs.runpod.io/api-reference/network-volumes/GET/networkvolumes#response-items-id)

id

string

A unique string identifying a network volume.

Example:

`"agv6w2qcg7"`

[​](https://docs.runpod.io/api-reference/network-volumes/GET/networkvolumes#response-items-name)

name

string

A user-defined name for a network volume. The name does not need to be unique.

Example:

`"my network volume"`

[​](https://docs.runpod.io/api-reference/network-volumes/GET/networkvolumes#response-items-size)

size

integer

The amount of disk space, in gigabytes (GB), allocated to a network volume.

Example:

`50`

Was this page helpful?

YesNo

[Suggest edits](https://github.com/runpod/docs/edit/main/api-reference/network-volumes/GET/networkvolumes.mdx) [Raise issue](https://github.com/runpod/docs/issues/new?title=Issue%20on%20docs&body=Path:%20/api-reference/network-volumes/GET/networkvolumes)

[Previous](https://docs.runpod.io/api-reference/network-volumes/POST/networkvolumes) [Find a network volume by IDReturns a single network volume.\\
\\
Next](https://docs.runpod.io/api-reference/network-volumes/GET/networkvolumes/networkVolumeId)

Ctrl+I

List network volumes

cURL

```
curl --request GET \
  --url https://rest.runpod.io/v1/networkvolumes \
  --header 'Authorization: Bearer <token>'
```

```
import requests

url = "https://rest.runpod.io/v1/networkvolumes"

headers = {"Authorization": "Bearer <token>"}

response = requests.get(url, headers=headers)

print(response.text)
```

```
const options = {method: 'GET', headers: {Authorization: 'Bearer <token>'}};

fetch('https://rest.runpod.io/v1/networkvolumes', options)
  .then(res => res.json())
  .then(res => console.log(res))
  .catch(err => console.error(err));
```

```
<?php

$curl = curl_init();

curl_setopt_array($curl, [\
  CURLOPT_URL => "https://rest.runpod.io/v1/networkvolumes",\
  CURLOPT_RETURNTRANSFER => true,\
  CURLOPT_ENCODING => "",\
  CURLOPT_MAXREDIRS => 10,\
  CURLOPT_TIMEOUT => 30,\
  CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,\
  CURLOPT_CUSTOMREQUEST => "GET",\
  CURLOPT_HTTPHEADER => [\
    "Authorization: Bearer <token>"\
  ],\
]);

$response = curl_exec($curl);
$err = curl_error($curl);

curl_close($curl);

if ($err) {
  echo "cURL Error #:" . $err;
} else {
  echo $response;
}
```

```
package main

import (
	"fmt"
	"net/http"
	"io"
)

func main() {

	url := "https://rest.runpod.io/v1/networkvolumes"

	req, _ := http.NewRequest("GET", url, nil)

	req.Header.Add("Authorization", "Bearer <token>")

	res, _ := http.DefaultClient.Do(req)

	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)

	fmt.Println(string(body))

}
```

```
HttpResponse<String> response = Unirest.get("https://rest.runpod.io/v1/networkvolumes")
  .header("Authorization", "Bearer <token>")
  .asString();
```

```
require 'uri'
require 'net/http'

url = URI("https://rest.runpod.io/v1/networkvolumes")

http = Net::HTTP.new(url.host, url.port)
http.use_ssl = true

request = Net::HTTP::Get.new(url)
request["Authorization"] = 'Bearer <token>'

response = http.request(request)
puts response.read_body
```

200

```
[\
  {\
    "dataCenterId": "EU-RO-1",\
    "id": "agv6w2qcg7",\
    "name": "my network volume",\
    "size": 50\
  }\
]
```

Ask AI Ctrl I

Runpod Assistant

Hi! How can I help you with Runpod today?
