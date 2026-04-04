class LeakyWidget {
  constructor(id) {
    this.id = id;
    this.data = Buffer.alloc(1024);
  }
}

const leaks = [];

setInterval(() => {
  for (let i = 0; i < 100; i++) {
    leaks.push(new LeakyWidget(i));
  }
  console.log(`Leak count: ${leaks.length}`);
}, 1000);

console.log('Leaky app running on port 9229...');