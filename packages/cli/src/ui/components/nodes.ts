export const NODES = [
  {
    id: '1',
    name: 'Load Image',
    inputs: [],
    outputs: ['image'],
  },
  {
    id: '2',
    name: 'Prompt',
    inputs: ['image'],
    outputs: ['text'],
  },
  {
    id: '3',
    name: 'Generate',
    inputs: ['text'],
    outputs: ['image'],
  },
];
