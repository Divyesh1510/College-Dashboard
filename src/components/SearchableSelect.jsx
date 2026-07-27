import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, MapPin, Coffee, BookOpen, Building, X, Crosshair, ChevronRight, ChevronLeft, Library } from 'lucide-react';

function getCategory(node) {
  if (node.type === 'poi' && node.category) {
    const cat = node.category;
    if (cat === 'Food') return { name: 'Food', icon: Coffee, color: '#F59E0B' };
    if (cat === 'Washroom') return { name: 'Washroom', icon: MapPin, color: '#38BDF8' };
    if (cat === 'Academic/Lab') return { name: 'Academic', icon: BookOpen, color: '#3B82F6' };
    if (cat === 'Admin') return { name: 'Admin/Facilities', icon: Building, color: '#8B5CF6' };
    if (cat === 'Sports') return { name: 'Sports', icon: MapPin, color: '#10B981' };
  }
  
  const lower = node.name.toLowerCase();
  if (lower.includes('cafe') || lower.includes('food') || lower.includes('canteen')) return { name: 'Food', icon: Coffee, color: '#F59E0B' };
  if (lower.includes('ground') || lower.includes('court') || lower.includes('sports')) return { name: 'Sports', icon: MapPin, color: '#10B981' };
  if (lower.includes('block') || lower.includes('school') || lower.includes('academic') || lower.includes('pharmacy')) return { name: 'Academic', icon: BookOpen, color: '#3B82F6' };
  if (lower.includes('admin') || lower.includes('office') || lower.includes('library') || lower.includes('kautilya')) return { name: 'Admin/Facilities', icon: Building, color: '#8B5CF6' };
  return { name: 'Other', icon: MapPin, color: '#94A3B8' };
}

export default function SearchableSelect({ label, value, onChange, nodes, placeholder, allowCurrentLocation, filterType }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewLevel, setViewLevel] = useState('main'); // 'main', 'blocks', 'classrooms'
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      setViewLevel('main');
      setSelectedBlockId(null);
      setSearchQuery('');
    }
  }, [isOpen]);


  const options = Object.values(nodes).filter(n => {
    if (n.type === 'intersection') return false;
    if (filterType && n.type !== filterType) return false;
    return true;
  });
  
  // Sort alphabetically
  options.sort((a, b) => a.name.localeCompare(b.name));
  
  const filteredOptions = options.filter(n => n.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const classrooms = options.filter(n => n.type === 'classroom');
  const nonClassrooms = options.filter(n => n.type !== 'classroom');

  const blockIdsWithClassrooms = [...new Set(classrooms.map(c => c.buildingNodeId))].filter(Boolean);
  
  const selectedNode = value === 'CURRENT_LOCATION' ? { name: '📍 Current Location' } : nodes[value];

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 'bold' }}>{label}</label>
      
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%', padding: '12px 16px', borderRadius: '8px', background: 'var(--surface)',
          border: isOpen ? '2px solid #4F46E5' : '1px solid var(--border)', color: 'var(--text)',
          fontSize: '16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}
      >
        <span style={{ color: selectedNode ? 'var(--text)' : 'var(--text-muted)' }}>
          {selectedNode ? selectedNode.name : placeholder}
        </span>
        {value ? (
          <X 
            size={16} 
            color="var(--text-muted)" 
            style={{ cursor: 'pointer' }}
            onClick={(e) => { e.stopPropagation(); onChange(''); setSearchQuery(''); }}
          />
        ) : (
          <Search size={16} color="var(--text-muted)" />
        )}
      </div>

      {isOpen && createPortal(
        <div style={{ position: 'relative', zIndex: 9999 }}>
          <div 
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', zIndex: 100 }}
            onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
          />
          <div style={{
            position: 'fixed', top: '10vh', left: '16px', right: '16px',
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.8)', zIndex: 101, maxHeight: '60vh', overflowY: 'auto',
            display: 'flex', flexDirection: 'column'
          }}>
          <div style={{ padding: '12px', position: 'sticky', top: 0, background: 'var(--surface)', borderBottom: '1px solid var(--border)', zIndex: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg)', borderRadius: '8px', padding: '8px 12px' }}>
              <Search size={18} color="var(--text-muted)" />
              <input 
                autoFocus
                placeholder="Search locations..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text)', width: '100%', marginLeft: '8px', outline: 'none', fontSize: '14px' }}
              />
            </div>
          </div>

          <div style={{ padding: '8px 0', flex: 1, overflowY: 'auto' }}>
            {/* If searching, show a flat list of all matches */}
            {searchQuery ? (
              filteredOptions.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)' }}>No locations found</div>
              ) : (
                filteredOptions.map(node => {
                  const cat = getCategory(node);
                  const Icon = cat.icon;
                  return (
                    <div 
                      key={node.id}
                      onClick={() => { onChange(node.id); setIsOpen(false); }}
                      style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ background: `${cat.color}20`, color: cat.color, padding: '6px', borderRadius: '50%', display: 'flex' }}>
                        <Icon size={16} />
                      </div>
                      <span style={{ color: 'var(--text)' }}>{node.name}</span>
                    </div>
                  );
                })
              )
            ) : (
              /* Not searching: Show Hierarchical View */
              <>
                {viewLevel === 'main' && (
                  <>
                    {allowCurrentLocation && (
                      <div 
                        onClick={() => { onChange('CURRENT_LOCATION'); setIsOpen(false); }}
                        style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{ background: '#3B82F6', padding: '6px', borderRadius: '50%', color: 'white', display: 'flex' }}>
                          <Crosshair size={16} />
                        </div>
                        <span style={{ fontWeight: 'bold', color: 'var(--text)' }}>Use Current Location</span>
                      </div>
                    )}

                    {classrooms.length > 0 && (
                      <div 
                        onClick={() => setViewLevel('blocks')}
                        style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{ background: '#10B98120', color: '#10B981', padding: '6px', borderRadius: '50%', display: 'flex' }}>
                          <Library size={16} />
                        </div>
                        <span style={{ flex: 1, color: 'var(--text)', fontWeight: '500' }}>Classrooms</span>
                        <ChevronRight size={18} color="var(--text-muted)" />
                      </div>
                    )}

                    {nonClassrooms.map(node => {
                      const cat = getCategory(node);
                      const Icon = cat.icon;
                      return (
                        <div 
                          key={node.id}
                          onClick={() => { onChange(node.id); setIsOpen(false); }}
                          style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <div style={{ background: `${cat.color}20`, color: cat.color, padding: '6px', borderRadius: '50%', display: 'flex' }}>
                            <Icon size={16} />
                          </div>
                          <span style={{ color: 'var(--text)' }}>{node.name}</span>
                        </div>
                      );
                    })}
                  </>
                )}

                {viewLevel === 'blocks' && (
                  <>
                    <div 
                      onClick={() => setViewLevel('main')}
                      style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontWeight: '500' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <ChevronLeft size={18} />
                      Back to Categories
                    </div>
                    {blockIdsWithClassrooms.map(blockId => {
                      const blockNode = nodes[blockId];
                      return (
                        <div 
                          key={blockId}
                          onClick={() => { setSelectedBlockId(blockId); setViewLevel('classrooms'); }}
                          style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <div style={{ background: '#3B82F620', color: '#3B82F6', padding: '6px', borderRadius: '50%', display: 'flex' }}>
                            <Building size={16} />
                          </div>
                          <span style={{ flex: 1, color: 'var(--text)' }}>{blockNode?.name || `Block ${blockId}`}</span>
                          <ChevronRight size={18} color="var(--text-muted)" />
                        </div>
                      );
                    })}
                  </>
                )}

                {viewLevel === 'classrooms' && (
                  <>
                    <div 
                      onClick={() => setViewLevel('blocks')}
                      style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontWeight: '500' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <ChevronLeft size={18} />
                      Back to Blocks
                    </div>
                    {classrooms.filter(c => c.buildingNodeId === selectedBlockId).map(node => (
                      <div 
                        key={node.id}
                        onClick={() => { onChange(node.id); setIsOpen(false); }}
                        style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{ background: '#10B98120', color: '#10B981', padding: '6px', borderRadius: '50%', display: 'flex' }}>
                          <BookOpen size={16} />
                        </div>
                        <span style={{ color: 'var(--text)' }}>{node.name}</span>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>
        </div>,
        document.body
      )}
    </div>
  );
}
