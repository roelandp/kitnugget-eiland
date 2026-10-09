import type { AnimalId } from '../scene/animals'

/** An animal neighbour and its lines. All lines are Dutch, short and never punishing. */
export interface AnimalInfo {
  id: AnimalId
  naam: string
  /** Greeting lines without a placeholder, usable for every question type. */
  ask: string[]
  /** Greeting lines with `{woord}`, replaced by the word (or "dit woord"). Used when the word is shown. */
  askWord: string[]
  /** Lines for a times-table sum, with `{som}` replaced by e.g. "7 x 8". */
  askSom: string[]
  /** Lines when the answer is right. */
  happy: string[]
  /** Gentle lines after a wrong answer: never punishing, encouraging. */
  learn: string[]
  bye: string[]
}

export const ANIMALS: AnimalInfo[] = [
  {
    id: 'eend',
    naam: 'Eend',
    ask: [
      'Kwak! Hoi Kit Nugget! Weet jij welk woord hierbij hoort?',
      'Kwak kwak! Ik heb een vraagje voor je, Kit Nugget.',
      'Hallo Kit Nugget! Help je mij met dit woord?',
      'Kwak! Ik zwom helemaal hierheen voor deze vraag.',
    ],
    askWord: [
      'Kwak! Weet jij wat {woord} betekent?',
      'Hoi Kit Nugget! Wat betekent {woord} eigenlijk?',
      'Kwak kwak! Ik hoorde het woord {woord}. Wat is dat?',
      'Kit Nugget, kun jij mij {woord} uitleggen?',
    ],
    askSom: [
      'Kwak! Hoi Kit Nugget! Hoeveel is {som}?',
      'Kwak kwak! Ik tel mijn veren. Weet jij {som}?',
      'Kwak! Help je mij even met {som}?',
    ],
    happy: [
      'Kwak! Helemaal goed!',
      'Kwak kwak, wat knap van jou!',
      'Ja! Daar word ik heel blij van. Kwak!',
      'Super, Kit Nugget! Mijn veren staan rechtop!',
      'Kwak! Jij weet echt veel woorden.',
    ],
    learn: [
      'Kwak! Nu weet je het. Volgende keer lukt het vast.',
      'Kijk, zo zit het. Dat onthouden we samen!',
      'Geeft niks, Kit Nugget. Nu ken je het woord.',
      'Kwak! Even goed kijken, dan zit het erin.',
      'Dit was een lastige. Straks probeer je het nog eens.',
    ],
    bye: [
      'Kwak! Dank je wel, Kit Nugget!',
      'Ik zwem weer verder. Tot snel!',
      'Kwak kwak, doei doei!',
      'Bedankt! Ik kom gauw weer langs.',
    ],
  },
  {
    id: 'schildpad',
    naam: 'Schildpad',
    ask: [
      'Rustig aan... Hoi Kit Nugget. Ik heb een vraag.',
      'Hallo Kit Nugget. Weet jij welk woord hierbij hoort?',
      'Rustig aan... denk er maar even goed over na.',
      'Ik ben langzaam, maar ik heb een mooie vraag.',
    ],
    askWord: [
      'Rustig aan... weet jij wat {woord} betekent?',
      'Hoi Kit Nugget. Wat betekent {woord}?',
      'Ik dacht onderweg aan {woord}. Wat is dat ook alweer?',
      'Neem je tijd. Wat betekent {woord}?',
    ],
    askSom: [
      'Rustig aan... hoeveel is {som}?',
      'Neem je tijd, Kit Nugget. Wat is {som}?',
      'Ik reken altijd langzaam. Weet jij {som}?',
    ],
    happy: [
      'Heel goed, Kit Nugget. Rustig en knap.',
      'Mooi zo. Dat weet je echt.',
      'Precies goed. Daar word ik warm van.',
      'Rustig aan... en toch meteen goed!',
      'Wat fijn. Jij leert snel.',
    ],
    learn: [
      'Rustig aan. Nu weet je het, en dat is fijn.',
      'Geeft niks. Ik leer ook stap voor stap.',
      'Kijk nog even rustig. Volgende keer lukt het vast.',
      'Zo zit het. Langzaam leren is ook leren.',
      'Nu ken je het woord. Straks komt het terug.',
    ],
    bye: [
      'Dank je wel, Kit Nugget. Ik ga weer rustig verder.',
      'Tot later. Het duurt even voor ik thuis ben.',
      'Bedankt. Rustig aan, hoor!',
      'Doei Kit Nugget. Ik kom weer langs.',
    ],
  },
  {
    id: 'uil',
    naam: 'Uilie',
    ask: [
      'Oehoe! Hoi Kit Nugget. Ik ben het, Uilie! Ik heb een wijze vraag.',
      'Kiekeboe! Uilie hier. Weet jij dit woord?',
      'Oehoe, weet jij welk woord hierbij hoort?',
      'Hallo Kit Nugget. Zullen we samen slim zijn?',
      'Oehoe! Ik las iets in mijn boek. Help je mij?',
    ],
    askWord: [
      'Oehoe! Weet jij wat {woord} betekent?',
      'Hoi Kit Nugget. Wat betekent het woord {woord}?',
      'Oehoe, ik las {woord} in een boek. Wat is dat?',
      'Een wijze vraag: wat betekent {woord}?',
    ],
    askSom: [
      'Oehoe! Een rekenvraag van Uilie: {som}?',
      'Oehoe, in mijn boek staat {som}. Wat is dat?',
      'Kiekeboe! Weet jij hoeveel {som} is?',
    ],
    happy: [
      'Oehoe! Dat is helemaal goed.',
      'Heel wijs, Kit Nugget!',
      'Oehoe oehoe, wat ben jij slim!',
      'Precies! Dat schrijf ik op in mijn boek.',
      'Knap gedaan. Jij wordt een echte woordenuil.',
    ],
    learn: [
      'Oehoe. Nu weet je het. Volgende keer lukt het vast.',
      'Ook wijze uilen leren elke dag iets nieuws.',
      'Kijk, zo zit het. Dat onthoud je vast.',
      'Oehoe, geeft niks. Straks vraag ik het nog eens.',
      'Van leren word je wijs. Nu ken je het!',
    ],
    bye: [
      'Oehoe! Dank je wel, Kit Nugget.',
      'Ik vlieg weer naar mijn boom. Tot ziens!',
      'Oehoe, tot de volgende keer!',
      'Bedankt voor het slimme antwoord. Doei!',
    ],
  },
  {
    id: 'konijn',
    naam: 'Konijn',
    ask: [
      'Hoi hoi Kit Nugget! Snel, ik heb een vraag!',
      'Hup, hier ben ik! Weet jij welk woord hierbij hoort?',
      'Hallo Kit Nugget! Ik roeide zo snel als ik kon!',
      'Hoi! Doe je mee? Ik heb een leuke vraag!',
    ],
    askWord: [
      'Hoi Kit Nugget! Wat betekent {woord}?',
      'Snel, snel! Weet jij wat {woord} betekent?',
      'Hup! Ik hoorde {woord}. Wat is dat?',
      'Hoi hoi! Kun jij mij {woord} uitleggen?',
    ],
    askSom: [
      'Hop hop! Hoeveel is {som}?',
      'Ik heb wortels geteld. Weet jij {som}?',
      'Hoi Kit Nugget! Wat is {som}?',
    ],
    happy: [
      'Jaaa! Goed zo, Kit Nugget!',
      'Hup hup hoera! Helemaal goed!',
      'Wauw, wat snel en wat knap!',
      'Goed! Ik maak een vreugdesprongetje!',
      'Super! Mijn oren wiebelen van blijdschap!',
    ],
    learn: [
      'Nu weet je het! Volgende keer lukt het vast.',
      'Geeft niks! Ik spring ook weleens mis.',
      'Kijk, zo is het. Hup, weer verder!',
      'Nu ken je het woord. Straks nog een keer!',
      'Even goed kijken, dan onthoud je het vast.',
    ],
    bye: [
      'Doei Kit Nugget! Ik roei weer naar huis!',
      'Bedankt! Tot snel, hup hup!',
      'Hoi hoi, ik ga weer! Dag!',
      'Dank je wel! Ik kom gauw terug!',
    ],
  },
  {
    id: 'kikker',
    naam: 'Kikker',
    ask: [
      'Kwaak! Hoi Kit Nugget! Ik heb een vraag.',
      'Kwaak kwaak! Weet jij welk woord hierbij hoort?',
      'Hallo Kit Nugget! Ik sprong van blad naar blad hierheen.',
      'Kwaak! Help je mij even met een woord?',
    ],
    askWord: [
      'Kwaak! Weet jij wat {woord} betekent?',
      'Hoi Kit Nugget! Wat betekent {woord}?',
      'Kwaak kwaak, wat is {woord} eigenlijk?',
      'Ik hoorde {woord} bij de vijver. Wat is dat?',
    ],
    askSom: [
      'Kwaak! Hoeveel is {som}?',
      'Ik ving vliegjes. Weet jij {som}?',
      'Kwaak kwaak! Weet jij {som}?',
    ],
    happy: [
      'Kwaak! Helemaal goed!',
      'Kwaak kwaak, wat goed van jou!',
      'Ja! Ik maak een kikkersprong van blijdschap!',
      'Top, Kit Nugget! Kwaak!',
      'Goed zo! Mijn strikje glimt ervan.',
    ],
    learn: [
      'Kwaak! Nu weet je het. Volgende keer lukt het vast.',
      'Geeft niks. Zo leren we samen.',
      'Kijk, zo zit het. Dat onthoud je vast!',
      'Kwaak, nu ken je het woord.',
      'Straks vraag ik het nog eens. Dan weet je het!',
    ],
    bye: [
      'Kwaak! Dank je wel, Kit Nugget!',
      'Ik spring weer naar de vijver. Doei!',
      'Kwaak kwaak, tot snel!',
      'Bedankt! Ik kom weer langs.',
    ],
  },
  {
    id: 'knuffel',
    naam: 'Regenboogknuffel',
    ask: [
      'Knuffeltijd! Maar eerst een vraagje, Kit Nugget.',
      'Hoi hoi! Ik ben de Regenboogknuffel. Weet jij dit?',
      'Ik ben zacht en vrolijk. Help je mij met een woord?',
      'Regenboogje hier! Welk woord hoort hierbij?',
    ],
    askWord: [
      'Hoi Kit Nugget! Wat betekent {woord}?',
      'Ik ben maar een knuffel. Wat is {woord}?',
      'Regenboogvraag: wat betekent {woord}?',
      'Knuffel en vraag tegelijk: {woord}, wat is dat?',
    ],
    askSom: [
      'Regenboogvraag: hoeveel is {som}?',
      'Hoi hoi! Weet jij {som}?',
      'Knuffel en som tegelijk: {som}?',
    ],
    happy: [
      'Jaaa! Dat verdient een regenboogknuffel!',
      'Goed zo! Ik word er nog kleuriger van.',
      'Helemaal goed! Knuffel!',
      'Wauw, Kit Nugget! Jij bent slim.',
      'Top! Alle kleuren van de regenboog voor jou.',
    ],
    learn: [
      'Geeft niks. Nu weet je het, knuffel!',
      'Kijk, zo zit het. Volgende keer lukt het vast.',
      'Even goed kijken. Dan onthoud je het!',
      'Zo leren we samen. Straks vraag ik het nog eens.',
      'Nu ken je het woord. Dat is fijn!',
    ],
    bye: [
      'Doei! Ik dobber weer weg.',
      'Dank je wel, Kit Nugget! Knuffel!',
      'Tot snel, regenboogvriend!',
      'Ik ga weer. Blijf zo knap!',
    ],
  },
  {
    id: 'papa',
    naam: 'Papa',
    ask: [
      'Zo. Papa is er. Opletten nu, Kit Nugget!',
      'Hup, geen gekke dingen. Welk woord hoort hierbij?',
      'Papa wil het goede antwoord zien. Goed nadenken!',
      'Ik kom speciaal met de helikopter. Laat maar zien wat je kan!',
    ],
    askWord: [
      'Zo. Wat betekent {woord}? Goed nadenken!',
      'Opletten nu: wat is {woord}?',
      'Papa wil het weten: wat betekent {woord}?',
      'Geen gegok. Wat is {woord}?',
    ],
    askSom: [
      'Zo. Opletten nu: hoeveel is {som}?',
      'Papa wil het weten: {som}?',
      'Geen gegok. Wat is {som}?',
    ],
    happy: [
      'Goed zo! Dat is dubbele punten waard!',
      'Kijk eens aan! Papa is trots. Dubbele punten!',
      'Helemaal goed. Dat verdient het dubbele!',
      'Prima gedaan, Kit Nugget! Dubbel verdiend.',
      'Zo doe je dat! Dubbele punten!',
    ],
    learn: [
      'Hmm. Kijk nog eens goed, zo zit het.',
      'Niet erg. Onthouden voor de volgende keer, hoor!',
      'Zo, nu weet je het. Ik vraag het nog eens.',
      'Goed kijken. Papa weet zeker dat je het straks wel weet.',
      'Dit is het goede antwoord. Dat lukt de volgende keer!',
    ],
    bye: [
      'Goed gewerkt. Papa vliegt weer verder!',
      'Ik moet weer gaan. Blijf oefenen, hè!',
      'Tot later. En niet te lang bouwen!',
      'Dag Kit Nugget! Ik hou je in de gaten.',
    ],
  },
]

export function animalById(id: AnimalId): AnimalInfo {
  return ANIMALS.find((a) => a.id === id) ?? ANIMALS[0]
}
