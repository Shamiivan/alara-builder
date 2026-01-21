import { useState } from 'react';
import { Button } from './components/Button';
import { Card } from './components/Card';

function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="app">
      <header className="header">
        <h1>Welcome Gus</h1>
        <p>We love ya</p>
      </header>

      <main className="main">
        <Card title="Getting Started">
          <p>I need to change this</p>
          <p>Edit again in the browswer</p>
        </Card>

        <Card title="Counter Demo">
          <p>Current count: {count}</p>
          <div className="button-group">
            <Button onClick={() => setCount(count - 1)}>Decrement</Button>
            <Button onClick={() => setCount(count + 1)}>Increment</Button>
          </div>
        </Card>

        <Card title="Features">
          <ul>
            <li>Live text editing</li>
            <li>CSS property inspection</li>
            <li>Real-time HMR updates</li>
            <li>Source code sync</li>
          </ul>
        </Card>
      </main>

      <footer className="footer">
        <p>Built with React + Vite + Alara</p>
      </footer>
    </div>
  );
}

export default App;
