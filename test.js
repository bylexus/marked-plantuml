const path = require('path');
const marked = require('marked');
const markedPlant = require('./index.js')(marked);

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

@startuml One nice 3rd image.jpg
Bob -> Alice : "Hello World"
@enduml
`;

const outDir = path.join(__dirname, 'output');


markedPlant(str,{
    plantumlOutputDir: outDir,
    renderServerUrl: 'http://www.plantuml.com/plantuml',
    // plantumlExec: '/usr/bin/plantuml',
    plantumlBase: 'output'
}).then(console.log).catch(e => {
    console.error(e);
});
