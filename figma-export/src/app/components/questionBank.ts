export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correct: number;
  explanation: string;
}

export const QUESTION_BANK: Record<string, QuizQuestion[]> = {
  mathematics: [
    { id: "m1", question: "What is the derivative of sin(x)?", options: ["cos(x)", "-cos(x)", "tan(x)", "-sin(x)"], correct: 0, explanation: "The derivative of sin(x) is cos(x), a fundamental result in calculus." },
    { id: "m2", question: "What is 15% of 240?", options: ["30", "36", "40", "24"], correct: 1, explanation: "15% of 240 = 0.15 × 240 = 36." },
    { id: "m3", question: "If 3x + 7 = 22, what is x?", options: ["3", "4", "5", "6"], correct: 2, explanation: "3x = 22 − 7 = 15, so x = 5." },
    { id: "m4", question: "What is √144?", options: ["11", "12", "13", "14"], correct: 1, explanation: "12 × 12 = 144, so √144 = 12." },
    { id: "m5", question: "What is the sum of interior angles in a triangle?", options: ["90°", "180°", "270°", "360°"], correct: 1, explanation: "All triangles have interior angles summing to exactly 180°." },
    { id: "m6", question: "What is 2¹⁰?", options: ["512", "1024", "2048", "256"], correct: 1, explanation: "2¹⁰ = 1024. This is why 1 KB = 1024 bytes in computing." },
    { id: "m7", question: "What is the slope of the line y = 3x + 2?", options: ["2", "3", "5", "1"], correct: 1, explanation: "In the slope-intercept form y = mx + b, m is the slope. Here m = 3." },
    { id: "m8", question: "What is 5! (5 factorial)?", options: ["25", "60", "100", "120"], correct: 3, explanation: "5! = 5 × 4 × 3 × 2 × 1 = 120." },
    { id: "m9", question: "What is π rounded to two decimal places?", options: ["3.12", "3.14", "3.16", "3.18"], correct: 1, explanation: "Pi (π) ≈ 3.14159…, rounded to 3.14." },
    { id: "m10", question: "What is log₁₀(1000)?", options: ["2", "3", "10", "100"], correct: 1, explanation: "10³ = 1000, so log₁₀(1000) = 3." },
    { id: "m11", question: "What is the area of a triangle with base 8 and height 5?", options: ["13", "20", "40", "80"], correct: 1, explanation: "Area = ½ × base × height = ½ × 8 × 5 = 20." },
    { id: "m12", question: "What is 0.75 expressed as a fraction in simplest form?", options: ["1/2", "3/5", "3/4", "7/10"], correct: 2, explanation: "0.75 = 75/100 = 3/4 after dividing numerator and denominator by 25." },
    { id: "m13", question: "In the Pythagorean theorem, what does c represent?", options: ["The shortest side", "A leg of the triangle", "The hypotenuse", "The perimeter"], correct: 2, explanation: "a² + b² = c², where c is the hypotenuse — the side opposite the right angle." },
    { id: "m14", question: "What is the value of x in the equation 2x − 4 = 10?", options: ["5", "6", "7", "8"], correct: 2, explanation: "2x = 14, so x = 7." },
    { id: "m15", question: "How many sides does a hexagon have?", options: ["5", "6", "7", "8"], correct: 1, explanation: "A hexagon has six sides. 'Hex' is Greek for six." },
  ],

  physics: [
    { id: "p1", question: "Approximately how fast does light travel in a vacuum?", options: ["3 × 10⁶ m/s", "3 × 10⁸ m/s", "3 × 10¹⁰ m/s", "3 × 10⁴ m/s"], correct: 1, explanation: "The speed of light in a vacuum is approximately 299,792,458 m/s ≈ 3 × 10⁸ m/s." },
    { id: "p2", question: "What does Newton's second law state?", options: ["F = mv", "F = ma", "E = mc²", "p = mv"], correct: 1, explanation: "Newton's second law: Force equals mass times acceleration (F = ma)." },
    { id: "p3", question: "What is the unit of electric resistance?", options: ["Volt", "Ampere", "Watt", "Ohm"], correct: 3, explanation: "The Ohm (Ω) is the SI unit of electrical resistance, named after Georg Ohm." },
    { id: "p4", question: "What is the formula for kinetic energy?", options: ["KE = mv", "KE = mgh", "KE = ½mv²", "KE = Fd"], correct: 2, explanation: "Kinetic energy KE = ½mv², where m is mass and v is velocity." },
    { id: "p5", question: "What is the acceleration due to gravity on Earth's surface?", options: ["8.9 m/s²", "9.8 m/s²", "10.5 m/s²", "7.6 m/s²"], correct: 1, explanation: "Earth's standard gravitational acceleration is approximately 9.8 m/s² (often approximated as 10 m/s²)." },
    { id: "p6", question: "What does Ohm's Law state?", options: ["V = P/I", "V = IR", "V = I/R", "V = R²I"], correct: 1, explanation: "Ohm's Law: Voltage (V) = Current (I) × Resistance (R)." },
    { id: "p7", question: "What is the SI unit of power?", options: ["Joule", "Newton", "Watt", "Pascal"], correct: 2, explanation: "The Watt (W) is the SI unit of power, equal to one Joule per second." },
    { id: "p8", question: "Approximately how fast does sound travel in air at 20°C?", options: ["343 m/s", "243 m/s", "443 m/s", "143 m/s"], correct: 0, explanation: "The speed of sound in air at 20°C is approximately 343 m/s." },
    { id: "p9", question: "What is the formula for gravitational potential energy?", options: ["PE = mv", "PE = ½mv²", "PE = mgh", "PE = Fd"], correct: 2, explanation: "Gravitational potential energy PE = mgh, where m is mass, g is gravity, and h is height." },
    { id: "p10", question: "According to Boyle's Law, if volume decreases at constant temperature, what happens to pressure?", options: ["It decreases", "It stays the same", "It increases", "It becomes zero"], correct: 2, explanation: "Boyle's Law: pressure and volume are inversely proportional (P₁V₁ = P₂V₂) at constant temperature." },
    { id: "p11", question: "Who proposed the theory of general relativity?", options: ["Isaac Newton", "Niels Bohr", "Albert Einstein", "Max Planck"], correct: 2, explanation: "Albert Einstein published his general theory of relativity in 1915." },
    { id: "p12", question: "What type of wave is light?", options: ["Longitudinal", "Mechanical", "Electromagnetic", "Sound"], correct: 2, explanation: "Light is an electromagnetic wave and does not require a medium to travel." },
    { id: "p13", question: "What is the first law of thermodynamics?", options: ["Entropy always increases", "Energy cannot be created or destroyed", "Heat flows from hot to cold", "Every action has a reaction"], correct: 1, explanation: "The first law is the conservation of energy: energy can be converted but not created or destroyed." },
    { id: "p14", question: "What phenomenon did Einstein's photoelectric effect explain?", options: ["Wave nature of light", "Electrons being ejected by photons", "Nuclear fission", "Black hole radiation"], correct: 1, explanation: "The photoelectric effect showed that photons of sufficient energy can eject electrons from a metal surface." },
    { id: "p15", question: "What is momentum?", options: ["Mass × velocity", "Force × time", "½ × mass × velocity²", "Mass × acceleration"], correct: 0, explanation: "Momentum p = mv, the product of an object's mass and velocity." },
  ],

  chemistry: [
    { id: "c1", question: "What is the chemical symbol for gold?", options: ["Go", "Gd", "Au", "Ag"], correct: 2, explanation: "Gold's symbol Au comes from its Latin name 'Aurum'." },
    { id: "c2", question: "What is the atomic number of carbon?", options: ["4", "6", "8", "12"], correct: 1, explanation: "Carbon has 6 protons, giving it atomic number 6." },
    { id: "c3", question: "What is the pH of pure water?", options: ["5", "6", "7", "8"], correct: 2, explanation: "Pure water has a neutral pH of 7, making it neither acidic nor basic." },
    { id: "c4", question: "What is the chemical formula for water?", options: ["HO", "H₂O", "H₂O₂", "HO₂"], correct: 1, explanation: "Water consists of two hydrogen atoms and one oxygen atom: H₂O." },
    { id: "c5", question: "Which element has the chemical symbol Fe?", options: ["Fluorine", "Francium", "Iron", "Fermium"], correct: 2, explanation: "Fe comes from Ferrum, the Latin name for Iron." },
    { id: "c6", question: "What is the most abundant gas in Earth's atmosphere?", options: ["Oxygen", "Carbon dioxide", "Argon", "Nitrogen"], correct: 3, explanation: "Nitrogen (N₂) makes up approximately 78% of Earth's atmosphere." },
    { id: "c7", question: "What is the chemical formula for table salt?", options: ["KCl", "NaCl", "CaCl₂", "MgCl₂"], correct: 1, explanation: "Table salt is sodium chloride, NaCl." },
    { id: "c8", question: "What type of chemical bond involves the sharing of electrons?", options: ["Ionic bond", "Covalent bond", "Metallic bond", "Hydrogen bond"], correct: 1, explanation: "Covalent bonds form when atoms share electrons, as in H₂O and CO₂." },
    { id: "c9", question: "What is the chemical formula for glucose?", options: ["C₆H₁₂O₆", "C₁₂H₂₂O₁₁", "CH₄O", "C₂H₅OH"], correct: 0, explanation: "Glucose is C₆H₁₂O₆, the primary sugar used by cells for energy." },
    { id: "c10", question: "What is a catalyst?", options: ["A product of a reaction", "A substance that slows reactions", "A substance that speeds reactions without being consumed", "A type of chemical bond"], correct: 2, explanation: "A catalyst increases reaction rate by providing an alternative pathway with lower activation energy, and is not consumed." },
    { id: "c11", question: "What is the boiling point of water at sea level?", options: ["90°C", "95°C", "100°C", "105°C"], correct: 2, explanation: "Water boils at 100°C (212°F) at standard atmospheric pressure." },
    { id: "c12", question: "How many electrons can the first electron shell hold?", options: ["1", "2", "4", "8"], correct: 1, explanation: "The first shell (n=1) can hold a maximum of 2 electrons." },
  ],

  biology: [
    { id: "b1", question: "Which organelle is known as the 'powerhouse of the cell'?", options: ["Nucleus", "Ribosome", "Mitochondria", "Golgi apparatus"], correct: 2, explanation: "Mitochondria produce ATP through cellular respiration, providing energy for the cell." },
    { id: "b2", question: "What does DNA stand for?", options: ["Deoxyribonucleic acid", "Diphosphate nucleic acid", "Diribose nucleotide acid", "Dextronucleic acid"], correct: 0, explanation: "DNA stands for Deoxyribonucleic Acid, the molecule carrying genetic information." },
    { id: "b3", question: "How many chromosomes do humans normally have?", options: ["23", "44", "46", "48"], correct: 2, explanation: "Humans typically have 46 chromosomes arranged in 23 pairs." },
    { id: "b4", question: "What is the primary function of red blood cells?", options: ["Fight infection", "Carry oxygen", "Clot blood", "Produce antibodies"], correct: 1, explanation: "Red blood cells contain hemoglobin, which binds and transports oxygen throughout the body." },
    { id: "b5", question: "What is the basic structural and functional unit of life?", options: ["Organ", "Tissue", "Atom", "Cell"], correct: 3, explanation: "The cell is the smallest unit capable of carrying out basic life functions." },
    { id: "b6", question: "What is photosynthesis?", options: ["Cellular respiration", "Converting light energy into glucose", "Breaking down food for energy", "DNA replication"], correct: 1, explanation: "Photosynthesis converts light energy, CO₂, and water into glucose and oxygen: 6CO₂ + 6H₂O + light → C₆H₁₂O₆ + 6O₂." },
    { id: "b7", question: "What is osmosis?", options: ["Movement of solutes through a membrane", "Movement of water across a semipermeable membrane", "The absorption of nutrients", "Active transport of ions"], correct: 1, explanation: "Osmosis is the passive movement of water from low to high solute concentration across a semipermeable membrane." },
    { id: "b8", question: "What is the role of ribosomes?", options: ["Energy production", "DNA replication", "Protein synthesis", "Lipid storage"], correct: 2, explanation: "Ribosomes translate mRNA sequences into proteins, making them the cell's protein factories." },
    { id: "b9", question: "Who proposed the theory of evolution by natural selection?", options: ["Gregor Mendel", "Louis Pasteur", "Charles Darwin", "James Watson"], correct: 2, explanation: "Charles Darwin proposed natural selection in 'On the Origin of Species' (1859)." },
    { id: "b10", question: "What type of cell division produces gametes (sex cells)?", options: ["Mitosis", "Meiosis", "Binary fission", "Budding"], correct: 1, explanation: "Meiosis produces haploid gametes (sperm and egg) with half the normal chromosome number." },
    { id: "b11", question: "Which part of the cell contains the genetic information?", options: ["Cell membrane", "Cytoplasm", "Nucleus", "Mitochondria"], correct: 2, explanation: "The nucleus houses the cell's DNA and controls gene expression and cell division." },
    { id: "b12", question: "What is an ecosystem?", options: ["A single organism's habitat", "A community of organisms and their physical environment", "The total number of species on Earth", "A type of biome"], correct: 1, explanation: "An ecosystem includes all living organisms in an area plus their non-living environment, interacting as a system." },
  ],

  history: [
    { id: "h1", question: "In what year did World War II end?", options: ["1943", "1944", "1945", "1946"], correct: 2, explanation: "World War II ended in 1945 with Germany's surrender in May and Japan's in September." },
    { id: "h2", question: "Who was the first President of the United States?", options: ["John Adams", "Thomas Jefferson", "Benjamin Franklin", "George Washington"], correct: 3, explanation: "George Washington served as the first US President from 1789 to 1797." },
    { id: "h3", question: "When did the French Revolution begin?", options: ["1776", "1789", "1799", "1804"], correct: 1, explanation: "The French Revolution began in 1789 with the storming of the Bastille on July 14." },
    { id: "h4", question: "In what year did Christopher Columbus first reach the Americas?", options: ["1488", "1492", "1498", "1502"], correct: 1, explanation: "Columbus reached the Bahamas on October 12, 1492, during his first voyage." },
    { id: "h5", question: "Who co-authored 'The Communist Manifesto'?", options: ["Lenin and Stalin", "Marx and Engels", "Marx and Trotsky", "Engels and Bakunin"], correct: 1, explanation: "Karl Marx and Friedrich Engels co-wrote 'The Communist Manifesto' in 1848." },
    { id: "h6", question: "When did the Berlin Wall fall?", options: ["1985", "1987", "1989", "1991"], correct: 2, explanation: "The Berlin Wall fell on November 9, 1989, symbolizing the end of the Cold War divide." },
    { id: "h7", question: "Who was the first human to walk on the Moon?", options: ["Yuri Gagarin", "Buzz Aldrin", "Neil Armstrong", "John Glenn"], correct: 2, explanation: "Neil Armstrong became the first person to walk on the Moon on July 20, 1969 (Apollo 11)." },
    { id: "h8", question: "In what year did World War I begin?", options: ["1912", "1914", "1916", "1918"], correct: 1, explanation: "World War I began in 1914, triggered by the assassination of Archduke Franz Ferdinand." },
    { id: "h9", question: "In what year did the American Civil War end?", options: ["1861", "1863", "1865", "1867"], correct: 2, explanation: "The American Civil War ended in April 1865 with the Confederate surrender." },
    { id: "h10", question: "Which ancient civilization built the pyramids at Giza?", options: ["Mesopotamians", "Greeks", "Romans", "Ancient Egyptians"], correct: 3, explanation: "The Great Pyramids of Giza were built by Ancient Egyptians as tombs for pharaohs around 2500 BCE." },
    { id: "h11", question: "Who was Julius Caesar?", options: ["A Greek philosopher", "A Roman general and statesman", "A Persian emperor", "An Egyptian pharaoh"], correct: 1, explanation: "Julius Caesar was a Roman general, statesman, and dictator who played a key role in Rome's transformation into an empire." },
    { id: "h12", question: "When did the Russian Revolution occur?", options: ["1905", "1910", "1917", "1922"], correct: 2, explanation: "The Russian Revolution of 1917 overthrew the Tsar and eventually led to the Soviet Union." },
  ],

  geography: [
    { id: "g1", question: "What is the largest continent by area?", options: ["Africa", "North America", "Asia", "Europe"], correct: 2, explanation: "Asia is the world's largest continent, covering about 44.6 million km²." },
    { id: "g2", question: "What is the capital city of Australia?", options: ["Sydney", "Melbourne", "Brisbane", "Canberra"], correct: 3, explanation: "Canberra is Australia's capital, chosen as a compromise between Sydney and Melbourne." },
    { id: "g3", question: "What is generally considered the longest river in the world?", options: ["Amazon", "Yangtze", "Mississippi", "Nile"], correct: 3, explanation: "The Nile River in Africa is traditionally considered the world's longest at approximately 6,650 km." },
    { id: "g4", question: "Which ocean is the largest?", options: ["Atlantic", "Indian", "Arctic", "Pacific"], correct: 3, explanation: "The Pacific Ocean is the largest, covering more than 165 million km² — larger than all land combined." },
    { id: "g5", question: "What is the tallest mountain in the world?", options: ["K2", "Kangchenjunga", "Mount Everest", "Lhotse"], correct: 2, explanation: "Mount Everest, at 8,848.86 m, is the highest point on Earth." },
    { id: "g6", question: "What is the capital of Canada?", options: ["Toronto", "Vancouver", "Montreal", "Ottawa"], correct: 3, explanation: "Ottawa, in Ontario, has been Canada's capital since 1857." },
    { id: "g7", question: "What is the smallest country in the world by area?", options: ["Monaco", "San Marino", "Liechtenstein", "Vatican City"], correct: 3, explanation: "Vatican City, at 0.44 km², is the world's smallest sovereign state." },
    { id: "g8", question: "Which country has the most freshwater lakes?", options: ["Russia", "USA", "Finland", "Canada"], correct: 3, explanation: "Canada contains about 9% of the world's freshwater and has more lakes than any other country." },
    { id: "g9", question: "Which is the world's largest desert?", options: ["Sahara", "Arabian", "Gobi", "Antarctic"], correct: 3, explanation: "Antarctica is technically the world's largest desert at 14.2 million km²; the Sahara is the largest hot desert." },
    { id: "g10", question: "What is the capital of Japan?", options: ["Osaka", "Kyoto", "Hiroshima", "Tokyo"], correct: 3, explanation: "Tokyo has been Japan's capital since 1869 and is one of the world's most populous cities." },
    { id: "g11", question: "On which continent is the Amazon Rainforest located?", options: ["Africa", "Asia", "South America", "Central America"], correct: 2, explanation: "The Amazon Rainforest spans nine countries in South America, primarily Brazil." },
    { id: "g12", question: "How many continents are there?", options: ["5", "6", "7", "8"], correct: 2, explanation: "There are 7 continents: Africa, Antarctica, Asia, Australia, Europe, North America, and South America." },
  ],

  literature: [
    { id: "l1", question: "Who wrote 'Romeo and Juliet'?", options: ["Christopher Marlowe", "William Shakespeare", "John Milton", "Geoffrey Chaucer"], correct: 1, explanation: "'Romeo and Juliet' was written by William Shakespeare around 1594–1596." },
    { id: "l2", question: "Who wrote the dystopian novel '1984'?", options: ["Aldous Huxley", "Ray Bradbury", "George Orwell", "Franz Kafka"], correct: 2, explanation: "George Orwell published '1984' in 1949, depicting a totalitarian surveillance state." },
    { id: "l3", question: "Who wrote 'Pride and Prejudice'?", options: ["Charlotte Brontë", "Emily Brontë", "Mary Shelley", "Jane Austen"], correct: 3, explanation: "Jane Austen wrote 'Pride and Prejudice', published in 1813." },
    { id: "l4", question: "What literary device gives human qualities to non-human things?", options: ["Metaphor", "Simile", "Personification", "Alliteration"], correct: 2, explanation: "Personification attributes human characteristics to animals, objects, or abstract concepts." },
    { id: "l5", question: "Who wrote 'The Great Gatsby'?", options: ["Ernest Hemingway", "F. Scott Fitzgerald", "John Steinbeck", "William Faulkner"], correct: 1, explanation: "F. Scott Fitzgerald wrote 'The Great Gatsby', published in 1925." },
    { id: "l6", question: "What is a haiku?", options: ["A 14-line poem", "A rhyming couplet", "A 3-line poem with 5-7-5 syllables", "An epic narrative poem"], correct: 2, explanation: "A haiku is a traditional Japanese poem with three lines of 5, 7, and 5 syllables respectively." },
    { id: "l7", question: "Who wrote 'To Kill a Mockingbird'?", options: ["Toni Morrison", "Harper Lee", "Truman Capote", "Flannery O'Connor"], correct: 1, explanation: "Harper Lee wrote 'To Kill a Mockingbird', published in 1960 and winner of the Pulitzer Prize." },
    { id: "l8", question: "Who is the author of 'The Odyssey'?", options: ["Virgil", "Sophocles", "Homer", "Ovid"], correct: 2, explanation: "The Odyssey is attributed to the ancient Greek poet Homer, telling Odysseus's journey home from Troy." },
    { id: "l9", question: "What is an allegory?", options: ["A comparison using 'like' or 'as'", "A story with a deeper symbolic meaning", "Repetition of consonant sounds", "An exaggerated statement"], correct: 1, explanation: "An allegory is a narrative where characters and events represent abstract ideas or moral qualities." },
    { id: "l10", question: "What is onomatopoeia?", options: ["Words that describe emotion", "A word that imitates a sound", "Repeating a sentence structure", "An indirect reference"], correct: 1, explanation: "Onomatopoeia refers to words that phonetically imitate their meaning, like 'buzz', 'crash', or 'sizzle'." },
  ],

  computer_science: [
    { id: "cs1", question: "What does CPU stand for?", options: ["Computer Processing Unit", "Central Processing Unit", "Core Program Utility", "Central Program Unit"], correct: 1, explanation: "CPU stands for Central Processing Unit — the primary component executing instructions in a computer." },
    { id: "cs2", question: "What is the time complexity of binary search on a sorted array?", options: ["O(n)", "O(n²)", "O(log n)", "O(1)"], correct: 2, explanation: "Binary search halves the search space each step, giving O(log n) time complexity." },
    { id: "cs3", question: "What does HTTP stand for?", options: ["Hyperlink Transfer Text Protocol", "Hypertext Transfer Protocol", "High Transfer Text Protocol", "Hybrid Text Transfer Protocol"], correct: 1, explanation: "HTTP (Hypertext Transfer Protocol) is the foundation of data communication on the World Wide Web." },
    { id: "cs4", question: "What is RAM?", options: ["Read-only Access Memory", "Random Access Memory", "Rapid Application Memory", "Remote Access Module"], correct: 1, explanation: "RAM (Random Access Memory) is volatile memory that temporarily stores data for active processes." },
    { id: "cs5", question: "What does a compiler do?", options: ["Runs programs line by line", "Translates source code into machine code", "Manages memory allocation", "Connects to the internet"], correct: 1, explanation: "A compiler translates entire source code into machine code before execution, unlike an interpreter." },
    { id: "cs6", question: "What is the key difference between a stack and a queue?", options: ["Stacks are faster", "Stack is LIFO, Queue is FIFO", "Queues have more memory", "Stack is FIFO, Queue is LIFO"], correct: 1, explanation: "A Stack uses Last-In-First-Out (LIFO) order; a Queue uses First-In-First-Out (FIFO) order." },
    { id: "cs7", question: "What is recursion in programming?", options: ["A loop that runs forever", "A function that calls itself", "A type of variable", "Parallel execution of code"], correct: 1, explanation: "Recursion is when a function calls itself with a modified input, typically with a base case to stop." },
    { id: "cs8", question: "What does SQL stand for?", options: ["Simple Query List", "Structured Query Language", "System Query Logic", "Standard Query Link"], correct: 1, explanation: "SQL (Structured Query Language) is the standard language for managing relational databases." },
    { id: "cs9", question: "What is an API?", options: ["A programming language", "Application Programming Interface", "An operating system", "An encryption method"], correct: 1, explanation: "An API (Application Programming Interface) defines how software components interact with each other." },
    { id: "cs10", question: "What does OOP stand for?", options: ["Optimized Operations Programming", "Object-Oriented Programming", "Ordered Output Processing", "Open Online Protocol"], correct: 1, explanation: "OOP (Object-Oriented Programming) organizes code into objects combining data (fields) and behavior (methods)." },
    { id: "cs11", question: "What is binary code?", options: ["Code with only letters", "A system using only 0s and 1s", "Code with 10 digits", "Encrypted text"], correct: 1, explanation: "Binary (base-2) uses only 0 and 1. All computer data is ultimately represented in binary." },
    { id: "cs12", question: "What is the purpose of a version control system like Git?", options: ["Speed up code execution", "Track and manage changes to code over time", "Compile programs", "Encrypt source code"], correct: 1, explanation: "Version control systems like Git track changes, enable collaboration, and allow reverting to previous states." },
  ],

  economics: [
    { id: "ec1", question: "What does GDP stand for?", options: ["Gross Domestic Product", "General Domestic Price", "Gross Development Price", "General Demand Production"], correct: 0, explanation: "GDP (Gross Domestic Product) measures the total monetary value of all goods and services produced in a country." },
    { id: "ec2", question: "What is inflation?", options: ["A decrease in money supply", "A general rise in price levels over time", "An increase in imports", "A decrease in unemployment"], correct: 1, explanation: "Inflation refers to the rate at which the general price level of goods and services rises, reducing purchasing power." },
    { id: "ec3", question: "What is opportunity cost?", options: ["The cost of raw materials", "The cost of the next best alternative forgone", "A government tax", "The price of a good"], correct: 1, explanation: "Opportunity cost is what you give up when making a choice — the value of the best alternative not taken." },
    { id: "ec4", question: "What is a monopoly?", options: ["A competitive market", "A market with one dominant seller", "A government tax policy", "A trade agreement"], correct: 1, explanation: "A monopoly exists when a single company dominates an entire market with no close substitutes." },
    { id: "ec5", question: "What is fiscal policy?", options: ["Central bank interest rate decisions", "Government spending and tax policies", "Exchange rate management", "Trade tariff regulation"], correct: 1, explanation: "Fiscal policy refers to government use of spending and taxation to influence the economy." },
    { id: "ec6", question: "What defines a recession?", options: ["Rising inflation for 2 months", "Two or more consecutive quarters of negative GDP growth", "A stock market crash", "Rising unemployment above 10%"], correct: 1, explanation: "A recession is typically defined as two consecutive quarters of negative GDP growth." },
    { id: "ec7", question: "What does the law of supply state?", options: ["Lower prices lead to more supply", "Higher prices lead to more supply", "Supply is always equal to demand", "Prices never change with supply"], correct: 1, explanation: "The law of supply states that as price increases, producers are willing to supply more of a good." },
    { id: "ec8", question: "What is microeconomics?", options: ["Study of national economies", "Study of individual consumer and firm decisions", "Study of global trade", "Study of monetary policy"], correct: 1, explanation: "Microeconomics examines individual economic agents — consumers, firms, and markets — and their decision-making." },
  ],

  psychology: [
    { id: "ps1", question: "Who is often called the father of modern psychology?", options: ["Sigmund Freud", "William James", "Wilhelm Wundt", "Ivan Pavlov"], correct: 2, explanation: "Wilhelm Wundt established the first experimental psychology laboratory in Leipzig in 1879." },
    { id: "ps2", question: "What concept is classical conditioning most associated with?", options: ["B.F. Skinner", "Ivan Pavlov", "Abraham Maslow", "Carl Jung"], correct: 1, explanation: "Ivan Pavlov discovered classical conditioning through his famous experiments with dogs and bells." },
    { id: "ps3", question: "What is cognitive dissonance?", options: ["A learning disorder", "Mental discomfort from holding conflicting beliefs", "A type of memory loss", "Extreme fear response"], correct: 1, explanation: "Cognitive dissonance is the mental discomfort experienced when holding contradictory beliefs or behaving contrary to one's values." },
    { id: "ps4", question: "What is Maslow's hierarchy of needs?", options: ["A theory of intelligence", "A five-level model of human motivation from basic needs to self-actualization", "A memory model", "A theory of personality types"], correct: 1, explanation: "Maslow's hierarchy is a motivational theory showing physiological, safety, social, esteem, and self-actualization needs in pyramid form." },
    { id: "ps5", question: "What is the bystander effect?", options: ["People act faster when watched", "Individuals are less likely to help when others are present", "A memory bias toward recent events", "Increased aggression in crowds"], correct: 1, explanation: "The bystander effect shows that the more people witness an emergency, the less likely any individual is to intervene." },
    { id: "ps6", question: "What is operant conditioning?", options: ["Learning by observation", "Learning through consequences — rewards and punishments", "Associating stimuli with responses", "Memory formation during sleep"], correct: 1, explanation: "Operant conditioning (B.F. Skinner) involves learning through positive/negative reinforcement and punishment." },
    { id: "ps7", question: "What does IQ measure?", options: ["Emotional intelligence", "General cognitive ability relative to a population", "Creativity level", "Social adaptability"], correct: 1, explanation: "IQ (Intelligence Quotient) is a score from standardized tests designed to measure general cognitive abilities." },
    { id: "ps8", question: "What is a placebo effect?", options: ["A drug's side effect", "Improvement from an inactive treatment due to belief", "A memory trick", "A type of cognitive bias"], correct: 1, explanation: "The placebo effect occurs when patients experience real improvements after receiving an inert treatment, due to belief or expectation." },
  ],

  art: [
    { id: "ar1", question: "Who painted the Mona Lisa?", options: ["Michelangelo", "Raphael", "Leonardo da Vinci", "Caravaggio"], correct: 2, explanation: "Leonardo da Vinci painted the Mona Lisa between 1503 and 1519. It now hangs in the Louvre." },
    { id: "ar2", question: "Who painted 'The Starry Night'?", options: ["Claude Monet", "Paul Gauguin", "Paul Cézanne", "Vincent van Gogh"], correct: 3, explanation: "'The Starry Night' was painted by Vincent van Gogh in June 1889 while in an asylum in Saint-Rémy." },
    { id: "ar3", question: "What are the three primary colors in traditional art?", options: ["Red, green, blue", "Red, yellow, blue", "Cyan, magenta, yellow", "Orange, purple, green"], correct: 1, explanation: "In traditional (subtractive) color theory, the primary colors are red, yellow, and blue." },
    { id: "ar4", question: "Who sculpted the statue of 'David'?", options: ["Leonardo da Vinci", "Raphael", "Donatello", "Michelangelo"], correct: 3, explanation: "Michelangelo sculpted 'David' between 1501 and 1504. It stands in the Galleria dell'Accademia in Florence." },
    { id: "ar5", question: "What art movement is characterized by capturing light and everyday scenes with loose brushwork?", options: ["Surrealism", "Cubism", "Impressionism", "Abstract Expressionism"], correct: 2, explanation: "Impressionism (1860s–1880s) featured artists like Monet and Renoir capturing fleeting moments and natural light." },
    { id: "ar6", question: "What is perspective in art?", options: ["The use of bright colors", "A technique creating the illusion of depth on a 2D surface", "Mixing art media", "Using geometric shapes"], correct: 1, explanation: "Linear perspective uses converging lines and a vanishing point to create the illusion of three-dimensional depth." },
    { id: "ar7", question: "Who was Salvador Dalí?", options: ["Italian Renaissance sculptor", "French Impressionist painter", "Spanish Surrealist artist", "German Expressionist"], correct: 2, explanation: "Salvador Dalí (1904–1989) was a prominent Spanish Surrealist known for dreamlike, bizarre imagery." },
    { id: "ar8", question: "What is abstract art?", options: ["Art depicting nature realistically", "Art that does not attempt to represent external reality accurately", "Art made digitally", "Portrait painting style"], correct: 1, explanation: "Abstract art uses shapes, colors, and forms to express ideas or emotions rather than representing recognizable objects." },
  ],

  music: [
    { id: "mu1", question: "What does 'tempo' mean in music?", options: ["Volume of a piece", "The key signature", "The speed of a musical piece", "The number of musicians"], correct: 2, explanation: "Tempo refers to the speed or pace at which a piece of music is played, usually measured in BPM (beats per minute)." },
    { id: "mu2", question: "How many semitones are in one octave?", options: ["7", "8", "10", "12"], correct: 3, explanation: "One octave contains 12 semitones (half steps) in the Western chromatic scale." },
    { id: "mu3", question: "Who composed 'Symphony No. 9 in D minor'?", options: ["Wolfgang Amadeus Mozart", "Johann Sebastian Bach", "Ludwig van Beethoven", "Franz Schubert"], correct: 2, explanation: "Ludwig van Beethoven composed his famous 9th Symphony, notably while completely deaf." },
    { id: "mu4", question: "What is a chord in music?", options: ["A single sustained note", "A group of three or more notes played simultaneously", "A type of rhythm pattern", "The transition between keys"], correct: 1, explanation: "A chord is three or more notes played at the same time, forming the harmonic basis of music." },
    { id: "mu5", question: "What does 'forte' mean in musical notation?", options: ["Play slowly", "Play softly", "Play loudly", "Play quickly"], correct: 2, explanation: "Forte (abbreviated f) is an Italian musical term meaning 'loud' or 'strong'." },
    { id: "mu6", question: "What is a time signature in music?", options: ["The tempo marking", "A notation indicating beats per measure and note value", "The key the piece is in", "The title of a piece"], correct: 1, explanation: "A time signature (e.g., 4/4) shows how many beats are in each measure and which note value equals one beat." },
    { id: "mu7", question: "What is a symphony?", options: ["A solo piano piece", "A large-scale orchestral composition in multiple movements", "A type of folk song", "A chamber music form"], correct: 1, explanation: "A symphony is an extended composition for full orchestra, typically in 4 movements with contrasting characters." },
    { id: "mu8", question: "What does 'pianissimo' (pp) mean?", options: ["Play very fast", "Play very softly", "Play very loudly", "Play with feeling"], correct: 1, explanation: "Pianissimo (pp) means 'very soft' in musical dynamics, quieter than piano (p)." },
  ],

  languages: [
    { id: "la1", question: "What is a noun?", options: ["An action word", "A word modifying a verb", "A person, place, thing, or idea", "A connecting word"], correct: 2, explanation: "A noun names a person, place, thing, or idea. Examples: 'teacher', 'city', 'book', 'freedom'." },
    { id: "la2", question: "What is a metaphor?", options: ["A comparison using 'like' or 'as'", "A direct comparison between two unlike things", "Repetition of consonant sounds", "An understatement"], correct: 1, explanation: "A metaphor directly states one thing is another (e.g., 'Life is a journey'), unlike a simile which uses 'like' or 'as'." },
    { id: "la3", question: "What language has the most native speakers worldwide?", options: ["English", "Spanish", "Hindi", "Mandarin Chinese"], correct: 3, explanation: "Mandarin Chinese has approximately 920 million native speakers, making it the most spoken native language." },
    { id: "la4", question: "What is a palindrome?", options: ["A word borrowed from another language", "A word or phrase reading the same forwards and backwards", "A word with multiple meanings", "A compound word"], correct: 1, explanation: "A palindrome reads the same forwards and backwards. Examples: 'racecar', 'level', 'madam'." },
    { id: "la5", question: "What is a synonym?", options: ["A word with the opposite meaning", "A word with the same or similar meaning", "A word that sounds like another", "A new word coined recently"], correct: 1, explanation: "A synonym is a word with the same or very similar meaning as another. 'Happy' and 'joyful' are synonyms." },
    { id: "la6", question: "What is etymology?", options: ["The study of insects", "The study of the origin and history of words", "The study of sounds in language", "The study of grammar rules"], correct: 1, explanation: "Etymology is the study of the origin of words and how their meanings have changed throughout history." },
    { id: "la7", question: "How many official languages does the United Nations recognize?", options: ["4", "6", "8", "10"], correct: 1, explanation: "The UN has 6 official languages: Arabic, Chinese, English, French, Russian, and Spanish." },
    { id: "la8", question: "What is onomatopoeia?", options: ["Using a word in place of another", "Words that imitate the sounds they describe", "Excessive repetition", "Switching word order for emphasis"], correct: 1, explanation: "Onomatopoeia refers to words whose sound imitates their meaning, such as 'buzz', 'splash', or 'hiss'." },
  ],

  philosophy: [
    { id: "ph1", question: "Who wrote 'The Republic'?", options: ["Aristotle", "Socrates", "Plato", "Epicurus"], correct: 2, explanation: "Plato wrote 'The Republic' (c. 380 BCE), exploring justice, government, and the ideal city-state." },
    { id: "ph2", question: "What is Socrates best known for?", options: ["Writing extensive philosophical texts", "The Socratic method of questioning", "Founding a school of philosophy", "Developing formal logic"], correct: 1, explanation: "Socrates is famous for the Socratic method — using probing questions to stimulate critical thinking and expose contradictions." },
    { id: "ph3", question: "What does utilitarianism promote?", options: ["Following divine commands", "The greatest good for the greatest number", "Individual rights above all else", "Living in accordance with nature"], correct: 1, explanation: "Utilitarianism (Mill, Bentham) holds that the right action maximizes overall happiness or utility." },
    { id: "ph4", question: "Who said 'I think, therefore I am' (Cogito ergo sum)?", options: ["Immanuel Kant", "John Locke", "René Descartes", "Baruch Spinoza"], correct: 2, explanation: "René Descartes wrote 'Cogito ergo sum' in 'Meditations on First Philosophy' (1641) as proof of his own existence." },
    { id: "ph5", question: "What is existentialism primarily concerned with?", options: ["The nature of matter and energy", "Individual existence, freedom, and authentic choice", "The logical structure of arguments", "Social and political justice"], correct: 1, explanation: "Existentialism (Sartre, Kierkegaard, Camus) emphasizes individual freedom, responsibility, and the search for meaning." },
    { id: "ph6", question: "Who wrote 'Thus Spoke Zarathustra'?", options: ["Arthur Schopenhauer", "Friedrich Nietzsche", "Søren Kierkegaard", "Georg Hegel"], correct: 1, explanation: "Friedrich Nietzsche wrote 'Thus Spoke Zarathustra' (1883–1885), introducing the concept of the Übermensch." },
    { id: "ph7", question: "What is epistemology?", options: ["The study of moral values", "The study of beauty and art", "The study of knowledge and justified belief", "The study of existence and reality"], correct: 2, explanation: "Epistemology is the branch of philosophy concerned with the nature, scope, and limits of human knowledge." },
    { id: "ph8", question: "What ethical dilemma involves choosing to divert a runaway trolley?", options: ["The Prisoner's Dilemma", "The Ship of Theseus", "The Trolley Problem", "Pascal's Wager"], correct: 2, explanation: "The Trolley Problem is a classic ethics thought experiment about utilitarian vs. deontological moral reasoning." },
  ],
};

export function getQuestionsForQuiz(
  subjectId: string,
  count: number,
  subtopics?: string[]
): QuizQuestion[] {
  const pool = QUESTION_BANK[subjectId] || QUESTION_BANK["mathematics"];
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const needed = Math.min(count, pool.length);
  const selected = shuffled.slice(0, needed);
  if (selected.length < count) {
    const extras = [...pool].sort(() => Math.random() - 0.5).slice(0, count - selected.length);
    return [...selected, ...extras];
  }
  return selected;
}
