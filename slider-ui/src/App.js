import './App.css';
import HorizontalScrollMenu from './HorizontalScrollMenu';

function App() {
  // Sample menu items - you can customize these
  const menuItems = [
    { id: 1, label: 'Home', href: '#home' },
    { id: 2, label: 'About', href: '#about' },
    { id: 3, label: 'Services', href: '#services' },
    { id: 4, label: 'Portfolio', href: '#portfolio' },
    { id: 5, label: 'Reviews', href: '#reviews' },
    { id: 6, label: 'Contact', href: '#contact' },
    { id: 7, label: 'Blog', href: '#blog' },
    { id: 8, label: 'Careers', href: '#careers' },
    { id: 9, label: 'Support', href: '#support' },
    { id: 10, label: 'Privacy', href: '#privacy' },
    { id: 11, label: 'Terms', href: '#terms' },
    { id: 12, label: 'FAQ', href: '#faq' },
  ];

  const handleMenuItemClick = (item) => {
    console.log(`Selected item: ${item.label}`);
    alert(`You selected: ${item.label}`);
  };

  return (
    <div className="App">
      <h1>Glass Overlay Drag Menu</h1>
      <HorizontalScrollMenu 
        items={menuItems} 
        onItemClick={handleMenuItemClick}
      />
      
      <div className="content">
        <p><strong>🎯 Interactive Glass Menu:</strong> Drag the glass overlay to move it between menu options!</p>
        <p>✨ The menu features a <strong>moveable glass box</strong> that slides between different options to make selections</p>
        <p>🎪 <strong>Smart Features:</strong></p>
        <ul style={{textAlign: 'left', maxWidth: '600px', margin: '0 auto'}}>
          <li><strong>Moving Glass Box:</strong> The glass overlay moves between options instead of staying fixed!</li>
          <li><strong>Direct Selection:</strong> Drag the glass box left or right to select different menu items</li>
          <li><strong>Active Highlighting:</strong> The item under the glass box gets highlighted and scaled</li>
          <li><strong>Smooth Movement:</strong> Glass box smoothly glides between positions with animations</li>
          <li><strong>Touch Support:</strong> Works seamlessly on mobile devices with touch gestures</li>
          <li><strong>Auto-snapping:</strong> Releases automatically snap the glass to the nearest item</li>
        </ul>
        <p>🎮 <strong>How to use:</strong> Click and drag the frosted glass box to move it between different menu options. The glass box will highlight and select whichever option it's positioned over!</p>
      </div>
    </div>
  );
}

export default App;
