marked-plantuml
=================

This is a wrapper around [marked](https://github.com/markedjs/marked/) that extracts [PlantUML](https://plantuml.com/) snippets
from the given Markdown, create diagram images, then hand over to `marked`. In the end you have:

* your Markdown processed as usual with `marked`
* PlantUML diagram images, linked in the generated HTML.

This wrapper can only be used in a nodejs environment, it is not meant to be used as Browser lib.

## Prerequisites

* nodejs
* A local PlantUML executable OR
* A PlantUML servlet available via http(s)

## Usage by example:

```js
const path = require('path');
const marked = require('marked');
const markedPlant = require('./index.js')(marked);

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
    // Where your image are generated:
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

## License

(c) 2020 Alexander Schenkel, alex-plantuml@alexi.ch

Feel free to use this lib in any way you want, as long as
you don't claim anything when it goes wrong. I'm also interested in what way you use my
code, so just drop me a note, please: alex-plantuml@alexi.ch

