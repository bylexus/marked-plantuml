marked-plantuml
=================

This is a wrapper around [marked](https://github.com/markedjs/marked/) that extracts [PlantUML](https://plantuml.com/) snippets
from the given Markdown, create diagram images, then hand over to `marked`. In the end you have:

* your Markdown processed as usual with `marked`
* PlantUML diagram images, linked in the generated HTML.

Images will either be created locally, by using a local PlantUML or a remote render server,
or the lib will create a full encoded PlantUML image url containing the diagram as encoded
string.

This wrapper can only be used in a nodejs environment, it is not meant to be used as Browser lib.
Also, for the time being, it only supports usage as a lib, not as command line tool.

## Prerequisites

* nodejs
* If you want the image files to be created:
    * A local PlantUML executable OR
    * A PlantUML servlet available via http(s)

## Usage by example:

```js
const path = require('path');
const marked = require('marked');
const markedPlant = require('marked-plantuml')(marked);

// A Markdown string, containing inline PlantUML code:
let str = `
Hello
=======

How are you? Here comes a diagram:

@startuml my-diagram.png
title My test diagram

class A {
    String a;
}
class B {

}

A <|-- B
@enduml

And here we go. Another one:

@startuml 2nd.svg
Bob -> Alice : hello
@enduml

And a 3rd:

@startuml 3rd.jpg
Bob -> Alice : "Hello World"
@enduml
`;

const outDir = path.join(__dirname, 'output');

markedPlant(str,{
    // Output type: either 'image' or 'url' (default: 'image')
    plantUmlOutputType: 'image',
    // Where your image are generated (default: cwd)
    plantumlOutputDir: outDir,
    // The base dir prefix used in the HTML (default: '.')
    plantumlBase: './base/dir',
    // PlantUML Render Servlet Base URL:
    renderServerUrl: 'http://www.plantuml.com/plantuml'
    // OR the full path to your PlantUML binary:
    plantumlExec: '/usr/bin/plantuml'
    // can also be something like:
    plantumlExec: 'java -jar plantuml.jar'
}).then(html => console.log(html)).catch(e => {
    console.error(e);
});
```

### PlantUML usage in your Markdown

Place your PlantUML directly in your markdown, using the following scheme:

```
@startuml [Image Name][.type]
.... some PlantUML code
@enduml
```

**Notes**:

* The Image Name is taken as file name and as Image alt tag. So make sure you don't use any special chars as Image Name.
* Possible types are all types supported by PlantUML:
  * png
  * svg
  * eps
  * pdf
  Note that your HTML display tool must be able to make sense of your image types (e.g. pdf in an img tag might be problematic)

## ES6 module usage

You can also use the un-bundled version of the library: The library itself is implemented as an ES6 module.
If your NodeJS version supports importing it as ES6 module (or if you are using a bundler/transpiler like webpack / babel),
you can use the unbundled version:

```js
import marked from 'marked';
import markedPlantuml from 'marked-plantuml/lib/marked-plantuml.js';
markedPlantuml = markedPlantuml(marked);

markedPlantuml(yourMarkedString,{
    // ...
}).then(html => console.log(html)).catch(e => {
    console.error(e);
});
```

## License

(c) 2020 Alexander Schenkel, alex-plantuml@alexi.ch

Feel free to use this lib in any way you want, as long as
you don't claim anything when it goes wrong. I'm also interested in what way you use my
code, so just drop me a note, please: alex-plantuml@alexi.ch

