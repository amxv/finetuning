# List Pods - Runpod Documentation

**URL:** https://docs.runpod.io/api-reference/pods/GET/pods

> ## Documentation Index
>
> Fetch the complete documentation index at: [/llms.txt](https://docs.runpod.io/llms.txt)
>
> Use this file to discover all available pages before exploring further.

[Skip to main content](https://docs.runpod.io/api-reference/pods/GET/pods#content-area)

[Docs](https://docs.runpod.io/overview) [Examples](https://docs.runpod.io/tutorials/introduction/overview) [Community](https://docs.runpod.io/community-solutions/overview) [CLI](https://docs.runpod.io/flash/cli/overview) [API](https://docs.runpod.io/api-reference/overview) [Models](https://docs.runpod.io/public-endpoints/models/flux-dev) [Release notes](https://docs.runpod.io/release-notes)

GET

/

pods

Try it

List Pods

cURL

```
curl --request GET \
  --url https://rest.runpod.io/v1/pods \
  --header 'Authorization: Bearer <token>'
```

```
import requests

url = "https://rest.runpod.io/v1/pods"

headers = {"Authorization": "Bearer <token>"}

response = requests.get(url, headers=headers)

print(response.text)
```

```
const options = {method: 'GET', headers: {Authorization: 'Bearer <token>'}};

fetch('https://rest.runpod.io/v1/pods', options)
  .then(res => res.json())
  .then(res => console.log(res))
  .catch(err => console.error(err));
```

```
<?php

$curl = curl_init();

curl_setopt_array($curl, [\
  CURLOPT_URL => "https://rest.runpod.io/v1/pods",\
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

	url := "https://rest.runpod.io/v1/pods"

	req, _ := http.NewRequest("GET", url, nil)

	req.Header.Add("Authorization", "Bearer <token>")

	res, _ := http.DefaultClient.Do(req)

	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)

	fmt.Println(string(body))

}
```

```
HttpResponse<String> response = Unirest.get("https://rest.runpod.io/v1/pods")
  .header("Authorization", "Bearer <token>")
  .asString();
```

```
require 'uri'
require 'net/http'

url = URI("https://rest.runpod.io/v1/pods")

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
    "adjustedCostPerHr": 0.69,\
    "aiApiId": null,\
    "consumerUserId": "user_2PyTJrLzeuwfZilRZ7JhCQDuSqo",\
    "containerDiskInGb": 50,\
    "containerRegistryAuthId": "clzdaifot0001l90809257ynb",\
    "costPerHr": "0.74",\
    "cpuFlavorId": "cpu3c",\
    "dockerEntrypoint": [\
      "<string>"\
    ],\
    "dockerStartCmd": [\
      "<string>"\
    ],\
    "endpointId": null,\
    "env": {\
      "ENV_VAR": "value"\
    },\
    "gpu": {\
      "id": "<string>",\
      "count": 1,\
      "displayName": "<string>",\
      "securePrice": 123,\
      "communityPrice": 123,\
      "oneMonthPrice": 123,\
      "threeMonthPrice": 123,\
      "sixMonthPrice": 123,\
      "oneWeekPrice": 123,\
      "communitySpotPrice": 123,\
      "secureSpotPrice": 123\
    },\
    "id": "xedezhzb9la3ye",\
    "image": "runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04",\
    "interruptible": false,\
    "lastStartedAt": "2024-07-12T19:14:40.144Z",\
    "lastStatusChange": "Rented by User: Fri Jul 12 2024 15:14:40 GMT-0400 (Eastern Daylight Time)",\
    "locked": false,\
    "machine": {\
      "minPodGpuCount": 123,\
      "gpuTypeId": "<string>",\
      "gpuType": {\
        "id": "<string>",\
        "count": 1,\
        "displayName": "<string>",\
        "securePrice": 123,\
        "communityPrice": 123,\
        "oneMonthPrice": 123,\
        "threeMonthPrice": 123,\
        "sixMonthPrice": 123,\
        "oneWeekPrice": 123,\
        "communitySpotPrice": 123,\
        "secureSpotPrice": 123\
      },\
      "cpuCount": 123,\
      "cpuTypeId": "<string>",\
      "cpuType": {\
        "id": "<string>",\
        "displayName": "<string>",\
        "cores": 123,\
        "threadsPerCore": 123,\
        "groupId": "<string>"\
      },\
      "location": "<string>",\
      "dataCenterId": "<string>",\
      "diskThroughputMBps": 123,\
      "maxDownloadSpeedMbps": 123,\
      "maxUploadSpeedMbps": 123,\
      "supportPublicIp": true,\
      "secureCloud": true,\
      "maintenanceStart": "<string>",\
      "maintenanceEnd": "<string>",\
      "maintenanceNote": "<string>",\
      "note": "<string>",\
      "costPerHr": 123,\
      "currentPricePerGpu": 123,\
      "gpuAvailable": 123,\
      "gpuDisplayName": "<string>"\
    },\
    "machineId": "s194cr8pls2z",\
    "memoryInGb": 62,\
    "name": "<string>",\
    "networkVolume": {\
      "id": "agv6w2qcg7",\
      "name": "my network volume",\
      "size": 50,\
      "dataCenterId": "EU-RO-1"\
    },\
    "portMappings": {\
      "22": 10341\
    },\
    "ports": [\
      "8888/http",\
      "22/tcp"\
    ],\
    "publicIp": "100.65.0.119",\
    "savingsPlans": [\
      {\
        "costPerHr": 0.21,\
        "endTime": "2024-07-12T19:14:40.144Z",\
        "gpuTypeId": "NVIDIA GeForce RTX 4090",\
        "id": "clkrb4qci0000mb09c7sualzo",\
        "podId": "xedezhzb9la3ye",\
        "startTime": "2024-05-12T19:14:40.144Z"\
      }\
    ],\
    "slsVersion": 0,\
    "templateId": null,\
    "vcpuCount": 24,\
    "volumeEncrypted": false,\
    "volumeInGb": 20,\
    "volumeMountPath": "/workspace"\
  }\
]
```

#### Authorizations

[​](https://docs.runpod.io/api-reference/pods/GET/pods#authorization-authorization)

Authorization

string

header

required

Bearer authentication header of the form `Bearer <token>`, where `<token>` is your auth token.

#### Query Parameters

[​](https://docs.runpod.io/api-reference/pods/GET/pods#parameter-compute-type)

computeType

enum<string>

Filter to only GPU or only CPU Pods.

Available options:

`GPU`,

`CPU`

Example:

`"CPU"`

[​](https://docs.runpod.io/api-reference/pods/GET/pods#parameter-cpu-flavor-id)

cpuFlavorId

string\[\]

Filter to CPU Pods with any of the listed CPU flavors.

Example:

```json
["cpu3c", "cpu5g"]
```

[​](https://docs.runpod.io/api-reference/pods/GET/pods#parameter-data-center-id)

dataCenterId

string\[\]

Filter to Pods located in any of the provided Runpod data centers.

Example:

```json
["EU-RO-1"]
```

[​](https://docs.runpod.io/api-reference/pods/GET/pods#parameter-desired-status)

desiredStatus

enum<string>

Filter to Pods currently in the provided state.

Available options:

`RUNNING`,

`EXITED`,

`TERMINATED`

Example:

`"RUNNING"`

[​](https://docs.runpod.io/api-reference/pods/GET/pods#parameter-endpoint-id)

endpointId

string

Filter to workers on the provided Serverless endpoint (note that endpoint workers are not included in the response by default, set includeWorkers to true to include them).

Maximum string length: `191`

[​](https://docs.runpod.io/api-reference/pods/GET/pods#parameter-gpu-type-id)

gpuTypeId

string\[\]

Filter to Pods with any of the listed GPU types attached.

Example:

```json
[\
  "NVIDIA GeForce RTX 4090",\
  "NVIDIA RTX A5000"\
]
```

[​](https://docs.runpod.io/api-reference/pods/GET/pods#parameter-id)

id

string

Filter to a specific Pod.

Example:

`"xedezhzb9la3ye"`

[​](https://docs.runpod.io/api-reference/pods/GET/pods#parameter-image-name)

imageName

string

Filter to Pods created with the provided image.

Example:

`"runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04"`

[​](https://docs.runpod.io/api-reference/pods/GET/pods#parameter-include-machine)

includeMachine

boolean

default:false

Include information about the machine the Pod is running on.

Example:

`true`

[​](https://docs.runpod.io/api-reference/pods/GET/pods#parameter-include-network-volume)

includeNetworkVolume

boolean

default:false

Include information about the network volume attached to the returned Pod, if any.

Example:

`true`

[​](https://docs.runpod.io/api-reference/pods/GET/pods#parameter-include-savings-plans)

includeSavingsPlans

boolean

default:false

Include information about the savings plans applied to the Pod.

Example:

`true`

[​](https://docs.runpod.io/api-reference/pods/GET/pods#parameter-include-template)

includeTemplate

boolean

default:false

Include information about the template the Pod uses, if any.

Example:

`true`

[​](https://docs.runpod.io/api-reference/pods/GET/pods#parameter-include-workers)

includeWorkers

boolean

default:false

Set to true to also list Pods which are Serverless workers.

Example:

`true`

[​](https://docs.runpod.io/api-reference/pods/GET/pods#parameter-name)

name

string

Filter to Pods with the provided name.

Maximum string length: `191`

[​](https://docs.runpod.io/api-reference/pods/GET/pods#parameter-network-volume-id)

networkVolumeId

string

Filter to Pods with the provided network volume attached.

Example:

`"agv6w2qcg7"`

[​](https://docs.runpod.io/api-reference/pods/GET/pods#parameter-template-id)

templateId

string

Filter to Pods created from the provided template.

Example:

`"30zmvf89kd"`

#### Response

200

application/json

Successful operation.

[​](https://docs.runpod.io/api-reference/pods/GET/pods#response-items-adjusted-cost-per-hr)

adjustedCostPerHr

number

The effective cost in Runpod credits per hour of running a Pod, adjusted by active Savings Plans.

Example:

`0.69`

[​](https://docs.runpod.io/api-reference/pods/GET/pods#response-items-ai-api-id)

aiApiId

string

Synonym for endpointId (legacy name).

Example:

`null`

[​](https://docs.runpod.io/api-reference/pods/GET/pods#response-items-consumer-user-id)

consumerUserId

string

A unique string identifying the Runpod user who rents a Pod.

Example:

`"user_2PyTJrLzeuwfZilRZ7JhCQDuSqo"`

[​](https://docs.runpod.io/api-reference/pods/GET/pods#response-items-container-disk-in-gb)

containerDiskInGb

integer

The amount of disk space, in gigabytes (GB), to allocate on the container disk for a Pod. The data on the container disk is wiped when the Pod restarts. To persist data across Pod restarts, set volumeInGb to configure the Pod network volume.

Example:

`50`

[​](https://docs.runpod.io/api-reference/pods/GET/pods#response-items-container-registry-auth-id)

containerRegistryAuthId

string

If a Pod is created with a container registry auth, the unique string identifying that container registry auth.

Example:

`"clzdaifot0001l90809257ynb"`

[​](https://docs.runpod.io/api-reference/pods/GET/pods#response-items-cost-per-hr)

costPerHr

number<currency>

The cost in Runpod credits per hour of running a Pod. Note that the actual cost may be lower if Savings Plans are applied.

Example:

`"0.74"`

[​](https://docs.runpod.io/api-reference/pods/GET/pods#response-items-cpu-flavor-id)

cpuFlavorId

string

If the Pod is a CPU Pod, the unique string identifying the CPU flavor the Pod is running on.

Example:

`"cpu3c"`

[​](https://docs.runpod.io/api-reference/pods/GET/pods#response-items-desired-status)

desiredStatus

enum<string>

The current expected status of a Pod.

Available options:

`RUNNING`,

`EXITED`,

`TERMINATED`

[​](https://docs.runpod.io/api-reference/pods/GET/pods#response-items-docker-entrypoint)

dockerEntrypoint

string\[\]

If specified, overrides the ENTRYPOINT for the Docker image run on the created Pod. If \[\], uses the ENTRYPOINT defined in the image.

[​](https://docs.runpod.io/api-reference/pods/GET/pods#response-items-docker-start-cmd)

dockerStartCmd

string\[\]

If specified, overrides the start CMD for the Docker image run on the created Pod. If \[\], uses the start CMD defined in the image.

[​](https://docs.runpod.io/api-reference/pods/GET/pods#response-items-endpoint-id)

endpointId

string

If the Pod is a Serverless worker, a unique string identifying the associated endpoint.

Example:

`null`

[​](https://docs.runpod.io/api-reference/pods/GET/pods#response-items-env)

env

object

Example:

```json
{ "ENV_VAR": "value" }
```

[​](https://docs.runpod.io/api-reference/pods/GET/pods#response-items-gpu)

gpu

object

Showchild attributes

[​](https://docs.runpod.io/api-reference/pods/GET/pods#response-items-id)

id

string

A unique string identifying a [Pod](https://docs.runpod.io/api-reference/pods/GET/pods#/components/schema/Pod).

Example:

`"xedezhzb9la3ye"`

[​](https://docs.runpod.io/api-reference/pods/GET/pods#response-items-image)

image

string

The image tag for the container run on a Pod.

Example:

`"runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04"`

[​](https://docs.runpod.io/api-reference/pods/GET/pods#response-items-interruptible)

interruptible

boolean

Describes how a Pod is rented. An interruptible Pod can be rented at a lower cost but can be stopped at any time to free up resources for another Pod. A reserved Pod is rented at a higher cost but runs until it exits or is manually stopped.

Example:

`false`

[​](https://docs.runpod.io/api-reference/pods/GET/pods#response-items-last-started-at)

lastStartedAt

string

The UTC timestamp when a Pod was last started.

Example:

`"2024-07-12T19:14:40.144Z"`

[​](https://docs.runpod.io/api-reference/pods/GET/pods#response-items-last-status-change)

lastStatusChange

string

A string describing the last lifecycle event on a Pod.

Example:

`"Rented by User: Fri Jul 12 2024 15:14:40 GMT-0400 (Eastern Daylight Time)"`

[​](https://docs.runpod.io/api-reference/pods/GET/pods#response-items-locked)

locked

boolean

Set to true to lock a Pod. Locking a Pod disables stopping or resetting the Pod.

Example:

`false`

[​](https://docs.runpod.io/api-reference/pods/GET/pods#response-items-machine)

machine

object

Information about the machine a Pod is running on (see [Machine](https://docs.runpod.io/api-reference/pods/GET/pods#/components/schemas/Machine)).

Showchild attributes

[​](https://docs.runpod.io/api-reference/pods/GET/pods#response-items-machine-id)

machineId

string

A unique string identifying the host machine a Pod is running on.

Example:

`"s194cr8pls2z"`

[​](https://docs.runpod.io/api-reference/pods/GET/pods#response-items-memory-in-gb)

memoryInGb

number

The amount of RAM, in gigabytes (GB), attached to a Pod.

Example:

`62`

[​](https://docs.runpod.io/api-reference/pods/GET/pods#response-items-name)

name

string

A user-defined name for the created Pod. The name does not need to be unique.

Maximum string length: `191`

[​](https://docs.runpod.io/api-reference/pods/GET/pods#response-items-network-volume)

networkVolume

object

If a network volume is attached to a Pod, information about the network volume (see [network volume schema](https://docs.runpod.io/api-reference/pods/GET/pods#/components/schemas/NetworkVolume)).

Showchild attributes

[​](https://docs.runpod.io/api-reference/pods/GET/pods#response-items-port-mappings-one-of-0)

portMappings

object \| null

A mapping of internal ports to public ports on a Pod. For example, { "22": 10341 } means that port 22 on the Pod is mapped to port 10341 and is publicly accessible at \[public ip\]:10341. If the Pod is still initializing, this mapping is not yet determined and will be empty.

Example:

```json
{ "22": 10341 }
```

[​](https://docs.runpod.io/api-reference/pods/GET/pods#response-items-ports)

ports

string\[\]

A list of ports exposed on a Pod. Each port is formatted as \[port number\]/\[protocol\]. Protocol can be either http or tcp.

Example:

```json
["8888/http", "22/tcp"]
```

[​](https://docs.runpod.io/api-reference/pods/GET/pods#response-items-public-ip-one-of-0)

publicIp

string<ipv4> \| null

The public IP address of a Pod. If the Pod is still initializing, this IP is not yet determined and will be empty.

Example:

`"100.65.0.119"`

[​](https://docs.runpod.io/api-reference/pods/GET/pods#response-items-savings-plans)

savingsPlans

object\[\]

The list of active Savings Plans applied to a Pod (see [Savings Plans](https://docs.runpod.io/api-reference/pods/GET/pods#/components/schemas/SavingsPlan)). If none are applied, the list is empty.

Showchild attributes

[​](https://docs.runpod.io/api-reference/pods/GET/pods#response-items-sls-version)

slsVersion

integer

If the Pod is a Serverless worker, the version of the associated endpoint (see [Endpoint Version](https://docs.runpod.io/api-reference/pods/GET/pods#/components/schemas/Endpoint/version)).

Example:

`0`

[​](https://docs.runpod.io/api-reference/pods/GET/pods#response-items-template-id)

templateId

string

If a Pod is created with a template, the unique string identifying that template.

Example:

`null`

[​](https://docs.runpod.io/api-reference/pods/GET/pods#response-items-vcpu-count)

vcpuCount

number

The number of virtual CPUs attached to a Pod.

Example:

`24`

[​](https://docs.runpod.io/api-reference/pods/GET/pods#response-items-volume-encrypted)

volumeEncrypted

boolean

Set to true if the local network volume of a Pod is encrypted. Can only be set when creating a Pod.

Example:

`false`

[​](https://docs.runpod.io/api-reference/pods/GET/pods#response-items-volume-in-gb)

volumeInGb

integer

The amount of disk space, in gigabytes (GB), to allocate on the Pod volume for a Pod. The data on the Pod volume is persisted across Pod restarts. To persist data so that future Pods can access it, create a network volume and set networkVolumeId to attach it to the Pod.

Example:

`20`

[​](https://docs.runpod.io/api-reference/pods/GET/pods#response-items-volume-mount-path)

volumeMountPath

string

If either a Pod volume or a network volume is attached to a Pod, the absolute path where the network volume is mounted in the filesystem.

Example:

`"/workspace"`

Was this page helpful?

YesNo

[Suggest edits](https://github.com/runpod/docs/edit/main/api-reference/pods/GET/pods.mdx) [Raise issue](https://github.com/runpod/docs/issues/new?title=Issue%20on%20docs&body=Path:%20/api-reference/pods/GET/pods)

[Previous](https://docs.runpod.io/api-reference/pods/POST/pods) [Find a Pod by IDReturns a single Pod.\\
\\
Next](https://docs.runpod.io/api-reference/pods/GET/pods/podId)

Ctrl+I

List Pods

cURL

```
curl --request GET \
  --url https://rest.runpod.io/v1/pods \
  --header 'Authorization: Bearer <token>'
```

```
import requests

url = "https://rest.runpod.io/v1/pods"

headers = {"Authorization": "Bearer <token>"}

response = requests.get(url, headers=headers)

print(response.text)
```

```
const options = {method: 'GET', headers: {Authorization: 'Bearer <token>'}};

fetch('https://rest.runpod.io/v1/pods', options)
  .then(res => res.json())
  .then(res => console.log(res))
  .catch(err => console.error(err));
```

```
<?php

$curl = curl_init();

curl_setopt_array($curl, [\
  CURLOPT_URL => "https://rest.runpod.io/v1/pods",\
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

	url := "https://rest.runpod.io/v1/pods"

	req, _ := http.NewRequest("GET", url, nil)

	req.Header.Add("Authorization", "Bearer <token>")

	res, _ := http.DefaultClient.Do(req)

	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)

	fmt.Println(string(body))

}
```

```
HttpResponse<String> response = Unirest.get("https://rest.runpod.io/v1/pods")
  .header("Authorization", "Bearer <token>")
  .asString();
```

```
require 'uri'
require 'net/http'

url = URI("https://rest.runpod.io/v1/pods")

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
    "adjustedCostPerHr": 0.69,\
    "aiApiId": null,\
    "consumerUserId": "user_2PyTJrLzeuwfZilRZ7JhCQDuSqo",\
    "containerDiskInGb": 50,\
    "containerRegistryAuthId": "clzdaifot0001l90809257ynb",\
    "costPerHr": "0.74",\
    "cpuFlavorId": "cpu3c",\
    "dockerEntrypoint": [\
      "<string>"\
    ],\
    "dockerStartCmd": [\
      "<string>"\
    ],\
    "endpointId": null,\
    "env": {\
      "ENV_VAR": "value"\
    },\
    "gpu": {\
      "id": "<string>",\
      "count": 1,\
      "displayName": "<string>",\
      "securePrice": 123,\
      "communityPrice": 123,\
      "oneMonthPrice": 123,\
      "threeMonthPrice": 123,\
      "sixMonthPrice": 123,\
      "oneWeekPrice": 123,\
      "communitySpotPrice": 123,\
      "secureSpotPrice": 123\
    },\
    "id": "xedezhzb9la3ye",\
    "image": "runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04",\
    "interruptible": false,\
    "lastStartedAt": "2024-07-12T19:14:40.144Z",\
    "lastStatusChange": "Rented by User: Fri Jul 12 2024 15:14:40 GMT-0400 (Eastern Daylight Time)",\
    "locked": false,\
    "machine": {\
      "minPodGpuCount": 123,\
      "gpuTypeId": "<string>",\
      "gpuType": {\
        "id": "<string>",\
        "count": 1,\
        "displayName": "<string>",\
        "securePrice": 123,\
        "communityPrice": 123,\
        "oneMonthPrice": 123,\
        "threeMonthPrice": 123,\
        "sixMonthPrice": 123,\
        "oneWeekPrice": 123,\
        "communitySpotPrice": 123,\
        "secureSpotPrice": 123\
      },\
      "cpuCount": 123,\
      "cpuTypeId": "<string>",\
      "cpuType": {\
        "id": "<string>",\
        "displayName": "<string>",\
        "cores": 123,\
        "threadsPerCore": 123,\
        "groupId": "<string>"\
      },\
      "location": "<string>",\
      "dataCenterId": "<string>",\
      "diskThroughputMBps": 123,\
      "maxDownloadSpeedMbps": 123,\
      "maxUploadSpeedMbps": 123,\
      "supportPublicIp": true,\
      "secureCloud": true,\
      "maintenanceStart": "<string>",\
      "maintenanceEnd": "<string>",\
      "maintenanceNote": "<string>",\
      "note": "<string>",\
      "costPerHr": 123,\
      "currentPricePerGpu": 123,\
      "gpuAvailable": 123,\
      "gpuDisplayName": "<string>"\
    },\
    "machineId": "s194cr8pls2z",\
    "memoryInGb": 62,\
    "name": "<string>",\
    "networkVolume": {\
      "id": "agv6w2qcg7",\
      "name": "my network volume",\
      "size": 50,\
      "dataCenterId": "EU-RO-1"\
    },\
    "portMappings": {\
      "22": 10341\
    },\
    "ports": [\
      "8888/http",\
      "22/tcp"\
    ],\
    "publicIp": "100.65.0.119",\
    "savingsPlans": [\
      {\
        "costPerHr": 0.21,\
        "endTime": "2024-07-12T19:14:40.144Z",\
        "gpuTypeId": "NVIDIA GeForce RTX 4090",\
        "id": "clkrb4qci0000mb09c7sualzo",\
        "podId": "xedezhzb9la3ye",\
        "startTime": "2024-05-12T19:14:40.144Z"\
      }\
    ],\
    "slsVersion": 0,\
    "templateId": null,\
    "vcpuCount": 24,\
    "volumeEncrypted": false,\
    "volumeInGb": 20,\
    "volumeMountPath": "/workspace"\
  }\
]
```

Ask AI Ctrl I

Runpod Assistant

Hi! How can I help you with Runpod today?
