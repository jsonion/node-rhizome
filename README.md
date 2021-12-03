# jsonion-remap

Remapping JSON objects to a simplified, alternative schema is a breeze with **jsonion-remap** package. Instructions, defining how structure and in part content types are transformed, are coded in a JavaScript object with a slightly special syntax that resembles CSS, goes easy on you with the details and is simple to read and understand.

Among the features of this rather small package with zero dependencies are also type validation, conditional remapping rules, and the possibility to reuse preparsed instructions to process and transform multiple JavaScript objects in a row, without the additional overhead.

Feel free to file an issue or submit a pull request, should you find a use-case that requires implementing additional features.


## Example usage

### Default module export is a one-off function

In this simple example a JS object is transformed into a flat form.

```javascript
import runRemap from 'jsonion-remap';

var testObject = {
  test: { 
  	object: { string: "test" }
  }
};

var remapInstructions = {
	this: 'object',
	'.test .object .string => object.resultString': null
};

console.log(runRemap(remapInstructions, testObject)); // Should output {resultString: "test"}
```

### Main class is exported as "remap" 

The main benefit of using "remap" class object is that it enables reusing preparsed properties for multiple JavaScript objects. The following example a Facebook JSON archive is remapped to a more flat form, with additional perks showcased.

```javascript
import { remap } from 'jsonion-remap';

var types = {
	string: 'string',
	number: 'number',
	float: parseFloat,

	stringDecode: function (string) {
		if (typeof string === 'string')
			return decodeURIComponent(escape(string));
		else
			return false;
	},

	stringDecodeNotEmpty: function (string) {
		if (typeof string === 'string' && string.length)
			return decodeURIComponent(escape(string));
		else
			return false;
	},

	timestampRoundToMinute: function (timestamp) {
		if (Number.isInteger(timestamp / 1)) {
			var coeff = 60;
			return Math.floor(timestamp / coeff) * coeff;
		} else
			return false;
	}
}

var posts = {

	'#': {

		this: 'post',

		'.timestamp': types.timestampRoundToMinute,
		'.data # .post => .post': types.stringDecode,
		'.data # .update_timestamp => post.update_timestamp': types.timestampRoundToMinute,

		'.title': types.stringDecodeNotEmpty,
		'.title => .action': {
			__type: types.stringDecode,
			__oneOf: [
				{
					regex: '{displayName} shared an event\.',
					type: 'shared_event'
				},
				{
					regex: '{displayName} was attending (.*) at (.*)[\.]*',
					type: 'attended_event',
					0: 'event_name',
					1: 'place_name'
				},
				{
					regex: '{displayName} shared a video from the playlist (.*)[\.]*',
					type: 'shared_video_from_playlist',
					0: 'playlist'
				}
			]},

		'.attachments # .data # .media': {
			this: 'media',
			remap: 'post.attachments # .media',

			'.uri': types.string,
			'.creation_timestamp': types.timestampRoundToMinute,
			'.title': types.stringDecodeNotEmpty,
			'.description': types.stringDecodeNotEmpty,

			'.media_metadata .photo_metadata': {
				remap: 'media.photo_metadata',

				'.taken_timestamp': types.timestampRoundToMinute,
				'.latitude': types.float,
				'.longitude': types.float,
				'.upload_ip': null
			},

			'.media_metadata .video_metadata': {
				remap: 'media.video_metadata',

				'.upload_timestamp': types.timestampRoundToMinute,
				'.upload_ip': null
			}
		},

		'.attachments # .data # .external_context': {
			this: 'external_context',
			remap: 'post.attachments # .external_context',

			'.url': types.string
		}
	}
};

var seedPosts = [
  {
    "timestamp": 1606559150,
    "attachments": [
      {
        "data": [
          {
            "external_context": {
              "url": "https://bbc.com/news/science-environment-55109092"
            }
          }
        ]
      }
    ],
    "data": [
      {
        "post": "bbc.com/news/science-environment-55109092"
      },
      {
        "update_timestamp": 1606666365
      }
    ]
  },
  {
    "timestamp": 1603470426,
    "data": [
      {
        "update_timestamp": 1603470426
      }
    ],
    "title": "Sant Applause shared a video from the playlist Have You Seen This?"
  },
];

var ctx = {
  Facebook: {
    displayName: "Sant Applause"
  }
}

var postsPreparsed = new remap(posts);

console.log(postsPreparsed.cache) // … returns internal state

console.log(postsPreparsed.run(seedPosts, ctx.Facebook)); /*

Should return a bunch of objects that feel much lighter to work with.

*/
```