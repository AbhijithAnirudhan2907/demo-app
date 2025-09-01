import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
} from 'chart.js';
import { Pie, Bar, Line } from 'react-chartjs-2';
import './App.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement
);

function App() {
  const [rawRows, setRawRows] = useState([]);
  const [fileError, setFileError] = useState('');
  const [activeTab, setActiveTab] = useState('report');
  const [developerFilter, setDeveloperFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [productiveFilter, setProductiveFilter] = useState('ALL');
  const [textQuery, setTextQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [numericTimeAs, setNumericTimeAs] = useState('HOURS');
  const [availableSheets, setAvailableSheets] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [workbookData, setWorkbookData] = useState(null);
  const [excludeLeave, setExcludeLeave] = useState(false);

  function normalizeHeaderKey(key) {
    if (typeof key !== 'string') return key;
    return key.replace(/\s+/g, ' ').trim();
  }

  function parseDateValue(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    return null;
  }

  function parseTimeSpentToMinutes(value, productiveHours = 0) {
    if (value == null || value === '') {
      // If Time Spent is empty, use productive hours as fallback
      return productiveHours ? Math.round(productiveHours * 60) : 0;
    }
    if (typeof value === 'number') {
      return numericTimeAs === 'HOURS' ? Math.round(value * 60) : Math.round(value);
    }
    const text = String(value).trim().toLowerCase();
    if (/^\d+:\d{1,2}$/.test(text)) {
      const [h, m] = text.split(':').map(Number);
      return h * 60 + m;
    }
    const matched = text.match(/(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m)?/);
    if (matched && (matched[1] || matched[2])) {
      const hours = matched[1] ? parseFloat(matched[1]) : 0;
      const minutes = matched[2] ? parseInt(matched[2], 10) : 0;
      return Math.round(hours * 60 + minutes);
    }
    const maybeNumber = Number(text);
    if (!Number.isNaN(maybeNumber)) {
      return numericTimeAs === 'HOURS' ? Math.round(maybeNumber * 60) : Math.round(maybeNumber);
    }
    // If we can't parse Time Spent, use productive hours as fallback
    return productiveHours ? Math.round(productiveHours * 60) : 0;
  }

  function requiredColumnsPresent(sampleRow) {
    const required = ['Date', 'Ticket', 'Task', 'Status', 'Productive', 'Time Spent', 'Developer'];
    const present = Object.keys(sampleRow || {}).map(normalizeHeaderKey);
    const missing = required.filter((col) => !present.includes(col));
    return { ok: missing.length === 0, missing };
  }

  function extractTicketNumber(ticketValue) {
    if (!ticketValue || typeof ticketValue !== 'string') return ticketValue;
    // Extract ticket number from URLs like "https://www.bistrainer.com/pm/tickets#!/14802"
    const match = ticketValue.match(/#!\/(\d+)$/);
    if (match) return `#${match[1]}`;
    return ticketValue;
  }

  function isDateSeparatorRow(row) {
    // Check if this is a date separator row (empty except for date in Task column)
    const normalized = {};
    Object.keys(row).forEach((k) => {
      normalized[normalizeHeaderKey(k)] = row[k];
    });
    
    const hasOnlyTaskDate = normalized['Task'] && 
                           !normalized['Date'] && 
                           !normalized['Ticket'] && 
                           !normalized['Status'] && 
                           !normalized['Developer'];
    
    if (hasOnlyTaskDate) {
      const taskValue = String(normalized['Task']).trim();
      // Check if it looks like a date
      return /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(taskValue) || 
             taskValue instanceof Date ||
             !isNaN(Date.parse(taskValue));
    }
    return false;
  }

  function isLeaveEntry(row) {
    // Check if this is a leave entry
    const task = String(row.task || '').toLowerCase().trim();
    const ticket = String(row.ticket || '').toLowerCase().trim();
    const status = String(row.status || '').toLowerCase().trim();
    
    return task.includes('leave') || 
           ticket.includes('leave') || 
           status.includes('leave') ||
           task.includes('vacation') ||
           task.includes('holiday') ||
           task.includes('sick') ||
           task.includes('time off') ||
           task.includes('pto');
  }

  function toRecord(row) {
    const normalized = {};
    Object.keys(row).forEach((k) => {
      normalized[normalizeHeaderKey(k)] = row[k];
    });
    const date = parseDateValue(normalized['Date']);
    const ticketRaw = String(normalized['Ticket'] ?? '').trim();
    const productiveHours = normalized['Productive'] ? Number(normalized['Productive']) : 0;
    const record = {
      date,
      ticket: ticketRaw,
      ticketDisplay: extractTicketNumber(ticketRaw),
      task: String(normalized['Task'] ?? '').trim(),
      status: String(normalized['Status'] ?? '').trim(),
      productive: productiveHours, // Changed: treat as hours, not boolean
      timeSpentMinutes: parseTimeSpentToMinutes(normalized['Time Spent'], productiveHours),
      developer: String(normalized['Developer'] ?? '').trim(),
      comments: String(normalized['Comments'] ?? '').trim(), // Added comments field
      original: normalized
    };
    return record;
  }

  function handleFileChange(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    setFileError('');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        
        // Filter out sheets that are likely summary sheets
        const dataSheets = workbook.SheetNames.filter(name => {
          const lowerName = name.toLowerCase();
          return !lowerName.includes('template') && 
                 !lowerName.includes('sheet15') && // Exclude summary sheets like "Sheet15"
                 !lowerName.startsWith('sheet') &&
                 lowerName !== 'summary';
        });
        
        setAvailableSheets(dataSheets);
        setWorkbookData(workbook);
        
        if (!dataSheets.length) {
          setRawRows([]);
          setFileError('No data sheets found in the Excel file.');
          return;
        }
        
        // Auto-select the first sheet
        const firstSheet = dataSheets[0];
        setSelectedSheet(firstSheet);
        loadSheetData(workbook, firstSheet);
        
      } catch (err) {
        setFileError('Failed to parse file. Please ensure it is a valid Excel file (.xlsx or .xls).');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function findHeaderRow(json) {
    // Look for the row that contains all required headers
    for (let i = 0; i < Math.min(json.length, 10); i++) {
      const row = json[i];
      const keys = Object.keys(row).map(normalizeHeaderKey);
      const hasDate = keys.includes('Date');
      const hasTicket = keys.includes('Ticket');
      const hasTask = keys.includes('Task');
      const hasStatus = keys.includes('Status');
      const hasProductive = keys.includes('Productive');
      const hasTimeSpent = keys.includes('Time Spent');
      const hasDeveloper = keys.includes('Developer');
      
      if (hasDate && hasTicket && hasTask && hasStatus && hasProductive && hasTimeSpent && hasDeveloper) {
        return i;
      }
    }
    return -1;
  }

  function loadSheetData(workbook, sheetName) {
    try {
      const sheet = workbook.Sheets[sheetName];
      
      // Try different parsing approaches
      let json = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
      
      if (!json.length) {
        setRawRows([]);
        setFileError('The selected sheet is empty.');
        return;
      }
      
      // Find the actual header row
      const headerRowIndex = findHeaderRow(json);
      if (headerRowIndex === -1) {
        // Try parsing with header row detection disabled
        json = XLSX.utils.sheet_to_json(sheet, { 
          defval: '', 
          raw: false,
          header: 1 // Use array format
        });
        
        // Look for header row in array format
        let headerRow = -1;
        for (let i = 0; i < Math.min(json.length, 10); i++) {
          const row = json[i];
          if (Array.isArray(row) && row.length >= 7) {
            const rowStr = row.join('').toLowerCase();
            if (rowStr.includes('date') && rowStr.includes('ticket') && 
                rowStr.includes('task') && rowStr.includes('status') && 
                rowStr.includes('productive') && rowStr.includes('developer')) {
              headerRow = i;
              break;
            }
          }
        }
        
        if (headerRow === -1) {
          setRawRows([]);
          setFileError('Could not find header row with required columns: Date, Ticket, Task, Status, Productive, Time Spent, Developer');
          return;
        }
        
        // Convert array format to object format using found header
        const headers = json[headerRow];
        const dataRows = json.slice(headerRow + 1);
        json = dataRows.map(row => {
          const obj = {};
          headers.forEach((header, index) => {
            if (header && row[index] !== undefined) {
              obj[header] = row[index];
            }
          });
          return obj;
        }).filter(row => Object.keys(row).length > 0);
      } else if (headerRowIndex > 0) {
        // Skip rows before the header
        json = json.slice(headerRowIndex);
      }
      
      if (!json.length) {
        setRawRows([]);
        setFileError('No data rows found after header.');
        return;
      }
      
      const presence = requiredColumnsPresent(json[0]);
      if (!presence.ok) {
        setRawRows([]);
        setFileError(`Missing required columns: ${presence.missing.join(', ')}. Found columns: ${Object.keys(json[0]).join(', ')}`);
        return;
      }
      
      // Filter out date separator rows and convert to records
      const validRows = json.filter(row => !isDateSeparatorRow(row));
      const records = validRows.map(toRecord).filter(record => 
        record.developer && record.task // Only require developer and task, date can be missing
      );
      
      setRawRows(records);
      setFileError('');
    } catch (err) {
      console.error('Sheet loading error:', err);
      setFileError(`Failed to load sheet data: ${err.message}`);
    }
  }

  function handleSheetChange(sheetName) {
    setSelectedSheet(sheetName);
    if (sheetName && workbookData) {
      loadSheetData(workbookData, sheetName);
    }
  }

  function resetFilters() {
    setDeveloperFilter('ALL');
    setStatusFilter('ALL');
    setProductiveFilter('ALL');
    setTextQuery('');
    setStartDate('');
    setEndDate('');
  }

  function resetPerformanceFilters() {
    setPerformanceStartDate('');
    setPerformanceEndDate('');
    setPerformanceTicketFilter('');
    setGroupByTask(false);
  }

  function getCurrentMonthDates() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    return {
      start: startOfMonth.toISOString().split('T')[0],
      end: endOfMonth.toISOString().split('T')[0]
    };
  }

  function applyThisMonth() {
    const dates = getCurrentMonthDates();
    setStartDate(dates.start);
    setEndDate(dates.end);
  }

  function applyThisMonthPerformance() {
    const dates = getCurrentMonthDates();
    setPerformanceStartDate(dates.start);
    setPerformanceEndDate(dates.end);
  }

  const uniqueDevelopers = useMemo(() => {
    const set = new Set(rawRows.map((r) => r.developer).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rawRows]);

  const uniqueStatuses = useMemo(() => {
    const set = new Set(rawRows.map((r) => r.status).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rawRows]);

  const filteredRows = useMemo(() => {
    return rawRows.filter((row) => {
      if (excludeLeave && isLeaveEntry(row)) return false;
      if (developerFilter !== 'ALL' && row.developer !== developerFilter) return false;
      if (statusFilter !== 'ALL' && row.status !== statusFilter) return false;
      if (productiveFilter !== 'ALL') {
        if (productiveFilter === 'YES' && row.productive <= 0) return false;
        if (productiveFilter === 'NO' && row.productive > 0) return false;
      }
      if (textQuery) {
        const q = textQuery.toLowerCase();
        const hay = `${row.ticket} ${row.task} ${row.ticketDisplay}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (startDate) {
        const from = new Date(startDate);
        if (!row.date || row.date < from) return false;
      }
      if (endDate) {
        const to = new Date(endDate);
        if (!row.date || row.date > new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999)) return false;
      }
      return true;
    });
  }, [rawRows, excludeLeave, developerFilter, statusFilter, productiveFilter, textQuery, startDate, endDate]);

  const totals = useMemo(() => {
    const minutes = filteredRows.reduce((acc, r) => acc + (r.timeSpentMinutes || 0), 0);
    const productiveHours = filteredRows.reduce((acc, r) => acc + (r.productive || 0), 0);
    const tasks = filteredRows.length;
    const developers = new Set(filteredRows.map((r) => r.developer).filter(Boolean)).size;
    const productiveCount = filteredRows.filter((r) => r.productive > 0).length;
    const nonProductiveCount = filteredRows.filter((r) => r.productive <= 0).length;
    return { minutes, productiveHours, tasks, developers, productiveCount, nonProductiveCount };
  }, [filteredRows]);

  const statusBreakdown = useMemo(() => {
    const map = new Map();
    filteredRows.forEach((r) => {
      const key = r.status || 'Unknown';
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [filteredRows]);

  const performanceDevelopers = useMemo(() => {
    return uniqueDevelopers;
  }, [uniqueDevelopers]);

  const [performanceDeveloper, setPerformanceDeveloper] = useState('');
  const [performanceStartDate, setPerformanceStartDate] = useState('');
  const [performanceEndDate, setPerformanceEndDate] = useState('');
  const [performanceTicketFilter, setPerformanceTicketFilter] = useState('');
  const [groupByTask, setGroupByTask] = useState(false);
  
  const performanceRows = useMemo(() => {
    if (!performanceDeveloper) return [];
    
    return rawRows.filter((row) => {
      // Leave filter
      if (excludeLeave && isLeaveEntry(row)) return false;
      
      // Developer filter
      if (row.developer !== performanceDeveloper) return false;
      
      // Date filters
      if (performanceStartDate) {
        const from = new Date(performanceStartDate);
        if (!row.date || row.date < from) return false;
      }
      if (performanceEndDate) {
        const to = new Date(performanceEndDate);
        if (!row.date || row.date > new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999)) return false;
      }
      
      // Ticket filter
      if (performanceTicketFilter) {
        const q = performanceTicketFilter.toLowerCase();
        const hay = `${row.ticket} ${row.ticketDisplay}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      
      return true;
    });
  }, [rawRows, excludeLeave, performanceDeveloper, performanceStartDate, performanceEndDate, performanceTicketFilter]);

  const groupedPerformanceData = useMemo(() => {
    if (!groupByTask || !performanceRows.length) return null;

    const taskGroups = new Map();
    
    performanceRows.forEach(row => {
      const taskKey = row.task.trim() || 'Unnamed Task';
      
      if (!taskGroups.has(taskKey)) {
        taskGroups.set(taskKey, {
          task: taskKey,
          entries: [],
          totalMinutes: 0,
          totalProductiveHours: 0,
          tickets: new Set(),
          statuses: new Set(),
          dates: [],
          count: 0
        });
      }
      
      const group = taskGroups.get(taskKey);
      group.entries.push(row);
      group.totalMinutes += row.timeSpentMinutes || 0;
      group.totalProductiveHours += row.productive || 0;
      group.tickets.add(row.ticketDisplay || row.ticket);
      group.statuses.add(row.status);
      if (row.date) group.dates.push(row.date);
      group.count += 1;
    });

    // Convert to array and sort by productive hours descending
    return Array.from(taskGroups.values())
      .map(group => ({
        ...group,
        tickets: Array.from(group.tickets).filter(Boolean),
        statuses: Array.from(group.statuses).filter(Boolean),
        avgProductiveHours: group.totalProductiveHours / group.count,
        firstDate: group.dates.length ? new Date(Math.min(...group.dates.map(d => new Date(d).getTime()))) : null,
        lastDate: group.dates.length ? new Date(Math.max(...group.dates.map(d => new Date(d).getTime()))) : null
      }))
      .sort((a, b) => b.totalProductiveHours - a.totalProductiveHours);
  }, [performanceRows, groupByTask]);

  const performanceTotals = useMemo(() => {
    const minutes = performanceRows.reduce((acc, r) => acc + (r.timeSpentMinutes || 0), 0);
    const productiveHours = performanceRows.reduce((acc, r) => acc + (r.productive || 0), 0);
    const tasks = performanceRows.length;
    const productiveCount = performanceRows.filter((r) => r.productive > 0).length;
    const nonProductiveCount = performanceRows.filter((r) => r.productive <= 0).length;
    const statusMap = new Map();
    performanceRows.forEach((r) => {
      const key = r.status || 'Unknown';
      statusMap.set(key, (statusMap.get(key) || 0) + 1);
    });
    const status = Array.from(statusMap.entries()).sort((a, b) => b[1] - a[1]);
    return { minutes, productiveHours, tasks, productiveCount, nonProductiveCount, status };
  }, [performanceRows]);

  // Chart data calculations
  const chartData = useMemo(() => {
    if (!performanceDeveloper || !performanceRows.length) return null;

    // Status pie chart data
    const statusPieData = {
      labels: performanceTotals.status.map(([status]) => status),
      datasets: [{
        data: performanceTotals.status.map(([, count]) => count),
        backgroundColor: [
          '#4f8cff', '#7aa2ff', '#2ecc71', '#ff6b6b', '#f39c12', 
          '#9b59b6', '#1abc9c', '#e74c3c', '#34495e', '#95a5a6'
        ],
        borderColor: '#232634',
        borderWidth: 2,
      }]
    };

    // Productive vs Non-Productive pie chart
    const productivePieData = {
      labels: ['Productive Tasks', 'Non-Productive Tasks'],
      datasets: [{
        data: [performanceTotals.productiveCount, performanceTotals.nonProductiveCount],
        backgroundColor: ['#2ecc71', '#e74c3c'],
        borderColor: '#232634',
        borderWidth: 2,
      }]
    };

    // Daily productivity bar chart
    const dailyData = new Map();
    performanceRows.forEach(row => {
      if (row.date) {
        const dateStr = new Date(row.date).toLocaleDateString();
        if (!dailyData.has(dateStr)) {
          dailyData.set(dateStr, { productive: 0, tasks: 0 });
        }
        const data = dailyData.get(dateStr);
        data.productive += row.productive || 0;
        data.tasks += 1;
      }
    });

    const sortedDates = Array.from(dailyData.keys()).sort((a, b) => new Date(a) - new Date(b));
    const dailyBarData = {
      labels: sortedDates,
      datasets: [
        {
          label: 'Productive Hours',
          data: sortedDates.map(date => dailyData.get(date).productive),
          backgroundColor: '#4f8cff',
          borderColor: '#4f8cff',
          borderWidth: 1,
        },
        {
          label: 'Task Count',
          data: sortedDates.map(date => dailyData.get(date).tasks),
          backgroundColor: '#7aa2ff',
          borderColor: '#7aa2ff',
          borderWidth: 1,
          yAxisID: 'y1',
        }
      ]
    };

    // Weekly trend line chart
    const weeklyData = new Map();
    performanceRows.forEach(row => {
      if (row.date) {
        const date = new Date(row.date);
        const weekStart = new Date(date.setDate(date.getDate() - date.getDay()));
        const weekStr = weekStart.toLocaleDateString();
        if (!weeklyData.has(weekStr)) {
          weeklyData.set(weekStr, { productive: 0, tasks: 0 });
        }
        const data = weeklyData.get(weekStr);
        data.productive += row.productive || 0;
        data.tasks += 1;
      }
    });

    const sortedWeeks = Array.from(weeklyData.keys()).sort((a, b) => new Date(a) - new Date(b));
    const weeklyLineData = {
      labels: sortedWeeks.map(week => `Week of ${week}`),
      datasets: [{
        label: 'Weekly Productive Hours',
        data: sortedWeeks.map(week => weeklyData.get(week).productive),
        borderColor: '#2ecc71',
        backgroundColor: 'rgba(46, 204, 113, 0.1)',
        tension: 0.4,
        fill: true,
      }]
    };

    return {
      statusPie: statusPieData,
      productivePie: productivePieData,
      dailyBar: dailyBarData,
      weeklyLine: weeklyLineData
    };
  }, [performanceDeveloper, performanceRows, performanceTotals]);

  function minutesToHoursString(min) {
    const hours = Math.floor(min / 60);
    const minutes = min % 60;
    return `${hours}h ${minutes}m`;
  }

  // Chart options
  const chartOptions = {
    pie: {
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#e6e7eb' }
        },
        tooltip: {
          backgroundColor: '#14161b',
          titleColor: '#e6e7eb',
          bodyColor: '#e6e7eb',
          borderColor: '#232634',
          borderWidth: 1,
        }
      }
    },
    bar: {
      responsive: true,
      plugins: {
        legend: {
          labels: { color: '#e6e7eb' }
        },
        tooltip: {
          backgroundColor: '#14161b',
          titleColor: '#e6e7eb',
          bodyColor: '#e6e7eb',
          borderColor: '#232634',
          borderWidth: 1,
        }
      },
      scales: {
        x: {
          ticks: { color: '#a8acb8' },
          grid: { color: '#232634' }
        },
        y: {
          ticks: { color: '#a8acb8' },
          grid: { color: '#232634' }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          ticks: { color: '#a8acb8' },
          grid: { drawOnChartArea: false },
        }
      }
    },
    line: {
      responsive: true,
      plugins: {
        legend: {
          labels: { color: '#e6e7eb' }
        },
        tooltip: {
          backgroundColor: '#14161b',
          titleColor: '#e6e7eb',
          bodyColor: '#e6e7eb',
          borderColor: '#232634',
          borderWidth: 1,
        }
      },
      scales: {
        x: {
          ticks: { color: '#a8acb8' },
          grid: { color: '#232634' }
        },
        y: {
          ticks: { color: '#a8acb8' },
          grid: { color: '#232634' }
        }
      }
    }
  };

  return (
    <div className="app-container">
      <div className="header">
        <h1>Sheet Checker — Project Reporting</h1>
      </div>

      <div className="uploader">
        <div className="uploader-row">
          <input type="file" accept=".xlsx,.xls" onChange={handleFileChange} />
          <div className="numeric-toggle">
            <label>Numeric Time Spent as:</label>
            <select value={numericTimeAs} onChange={(e) => setNumericTimeAs(e.target.value)}>
              <option value="HOURS">Hours</option>
              <option value="MINUTES">Minutes</option>
            </select>
          </div>
        </div>
        
        {availableSheets.length > 0 && (
          <div className="sheet-selector">
            <label>Select Sheet:</label>
            <select value={selectedSheet} onChange={(e) => handleSheetChange(e.target.value)}>
              {availableSheets.map(sheet => (
                <option key={sheet} value={sheet}>{sheet}</option>
              ))}
            </select>
          </div>
        )}
        
        {fileError ? <div className="error">{fileError}</div> : null}
        
        {availableSheets.length > 0 && (
          <div className="debug-info" style={{fontSize: '12px', color: 'var(--muted)', marginTop: '8px'}}>
            Available sheets: {availableSheets.join(', ')}
          </div>
        )}
        {rawRows.length > 0 ? (
          <div className="upload-summary">
            <span>Loaded {rawRows.length} rows from sheet: {selectedSheet}</span>
          </div>
        ) : (
          <div className="hint">Upload a BIS Internal Timesheet Excel file with multiple monthly sheets</div>
        )}
      </div>

      <div className="tabs-section">
        <div className="tabs">
          <button className={activeTab === 'report' ? 'tab active' : 'tab'} onClick={() => setActiveTab('report')}>Report</button>
          <button className={activeTab === 'performance' ? 'tab active' : 'tab'} onClick={() => setActiveTab('performance')}>Performance</button>
        </div>
        
        {rawRows.length > 0 && (
          <div className="global-filters">
            <label className="checkbox-label">
              <input 
                type="checkbox" 
                checked={excludeLeave} 
                onChange={(e) => setExcludeLeave(e.target.checked)} 
              />
              <span>Exclude Leave Entries</span>
            </label>
            {(startDate || endDate) && (
              <div className="active-period">
                {startDate && endDate && 
                 new Date(startDate).getMonth() === new Date().getMonth() && 
                 new Date(startDate).getFullYear() === new Date().getFullYear() ? (
                  <span className="chip current-month">This Month Active</span>
                ) : (
                  <span className="chip">Custom Period Active</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {activeTab === 'report' ? (
        <div className="report">
          <div className="filters">
            <div className="filter-item">
              <label>Developer</label>
              <select value={developerFilter} onChange={(e) => setDeveloperFilter(e.target.value)} disabled={!rawRows.length}>
                <option value="ALL">All</option>
                {uniqueDevelopers.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="filter-item">
              <label>Status</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} disabled={!rawRows.length}>
                <option value="ALL">All</option>
                {uniqueStatuses.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="filter-item">
              <label>Productive</label>
              <select value={productiveFilter} onChange={(e) => setProductiveFilter(e.target.value)} disabled={!rawRows.length}>
                <option value="ALL">All</option>
                <option value="YES">Productive Only</option>
                <option value="NO">Non-Productive Only</option>
              </select>
            </div>
            <div className="filter-item">
              <label>Start Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={!rawRows.length} />
            </div>
            <div className="filter-item">
              <label>End Date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={!rawRows.length} />
            </div>
            <div className="filter-item grow">
              <label>Search Ticket/Task</label>
              <input type="text" placeholder="Search..." value={textQuery} onChange={(e) => setTextQuery(e.target.value)} disabled={!rawRows.length} />
            </div>
            <div className="filter-actions">
              <button onClick={applyThisMonth} disabled={!rawRows.length} className="this-month-btn">This Month</button>
              <button onClick={resetFilters} disabled={!rawRows.length}>Reset</button>
            </div>
          </div>

          {!!rawRows.length && (
            <div className="summary">
              <div className="summary-item">
                <div className="label">Tasks</div>
                <div className="value">{totals.tasks}</div>
              </div>
              <div className="summary-item">
                <div className="label">Total Time</div>
                <div className="value">{minutesToHoursString(totals.minutes)}</div>
              </div>
              <div className="summary-item">
                <div className="label">Productive Hours</div>
                <div className="value">{totals.productiveHours.toFixed(1)}h</div>
              </div>
              <div className="summary-item">
                <div className="label">Developers</div>
                <div className="value">{totals.developers}</div>
              </div>
              <div className="summary-item">
                <div className="label">Productive Tasks</div>
                <div className="value">{totals.productiveCount}</div>
              </div>
              <div className="summary-item">
                <div className="label">Non-Productive Tasks</div>
                <div className="value">{totals.nonProductiveCount}</div>
              </div>
            </div>
          )}

          {!!filteredRows.length && (
            <div className="status-breakdown">
              <div className="status-title">Status Breakdown</div>
              <div className="status-chips">
                {statusBreakdown.map(([name, count]) => (
                  <span key={name} className="chip">{name}: {count}</span>
                ))}
              </div>
            </div>
          )}

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Ticket</th>
                  <th>Task</th>
                  <th>Status</th>
                  <th>Productive Hours</th>
                  <th>Time Spent</th>
                  <th>Developer</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r, idx) => (
                  <tr key={idx}>
                    <td>{r.date ? new Date(r.date).toLocaleDateString() : ''}</td>
                    <td title={r.ticket}>{r.ticketDisplay}</td>
                    <td>{r.task}</td>
                    <td>{r.status}</td>
                    <td>{r.productive ? r.productive.toFixed(1) : '0'}</td>
                    <td>
                      {minutesToHoursString(r.timeSpentMinutes)}
                      {r.original && (!r.original['Time Spent'] || r.original['Time Spent'] === '') && r.productive > 0 && (
                        <span className="fallback-indicator" title="Using productive hours as time spent">*</span>
                      )}
                    </td>
                    <td>{r.developer}</td>
                  </tr>
                ))}
                {!filteredRows.length && (
                  <tr>
                    <td colSpan="7" className="no-data">{rawRows.length ? 'No rows match filters.' : 'No data loaded.'}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="performance">
          <div className="performance-controls">
            <div className="filter-item">
              <label>Team Member</label>
              <select value={performanceDeveloper} onChange={(e) => setPerformanceDeveloper(e.target.value)} disabled={!rawRows.length}>
                <option value="">Select a developer</option>
                {performanceDevelopers.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          {performanceDeveloper && (
            <div className="performance-filters">
              <div className="filters">
                <div className="filter-item">
                  <label>Start Date</label>
                  <input 
                    type="date" 
                    value={performanceStartDate} 
                    onChange={(e) => setPerformanceStartDate(e.target.value)} 
                    disabled={!rawRows.length} 
                  />
                </div>
                <div className="filter-item">
                  <label>End Date</label>
                  <input 
                    type="date" 
                    value={performanceEndDate} 
                    onChange={(e) => setPerformanceEndDate(e.target.value)} 
                    disabled={!rawRows.length} 
                  />
                </div>
                <div className="filter-item grow">
                  <label>Search Ticket</label>
                  <input 
                    type="text" 
                    placeholder="Search ticket number or URL..." 
                    value={performanceTicketFilter} 
                    onChange={(e) => setPerformanceTicketFilter(e.target.value)} 
                    disabled={!rawRows.length} 
                  />
                </div>
                <div className="filter-actions">
                  <button onClick={applyThisMonthPerformance} disabled={!rawRows.length} className="this-month-btn">This Month</button>
                  <button 
                    onClick={() => setGroupByTask(!groupByTask)} 
                    disabled={!rawRows.length} 
                    className={groupByTask ? 'group-btn active' : 'group-btn'}
                  >
                    {groupByTask ? 'Ungroup Tasks' : 'Group by Task'}
                  </button>
                  <button onClick={resetPerformanceFilters} disabled={!rawRows.length}>Reset Filters</button>
                </div>
              </div>
            </div>
          )}

          {performanceDeveloper && (
            <div className="performance-summary">
              <div className="filter-summary">
                <span><strong>{performanceDeveloper}</strong></span>
                {(performanceStartDate || performanceEndDate || performanceTicketFilter) && (
                  <span className="active-filters">
                    {performanceStartDate && <span className="chip">From: {performanceStartDate}</span>}
                    {performanceEndDate && <span className="chip">To: {performanceEndDate}</span>}
                    {performanceTicketFilter && <span className="chip">Ticket: {performanceTicketFilter}</span>}
                  </span>
                )}
              </div>
            </div>
          )}

          {performanceDeveloper && (
            <div className="performance-kpis">
              <div className="summary-item">
                <div className="label">Tasks</div>
                <div className="value">{performanceTotals.tasks}</div>
              </div>
              <div className="summary-item">
                <div className="label">Total Time</div>
                <div className="value">{minutesToHoursString(performanceTotals.minutes)}</div>
              </div>
              <div className="summary-item">
                <div className="label">Productive Hours</div>
                <div className="value">{performanceTotals.productiveHours.toFixed(1)}h</div>
              </div>
              <div className="summary-item">
                <div className="label">Productive Tasks</div>
                <div className="value">{performanceTotals.productiveCount}</div>
              </div>
              <div className="summary-item">
                <div className="label">Non-Productive Tasks</div>
                <div className="value">{performanceTotals.nonProductiveCount}</div>
              </div>
            </div>
          )}

          {performanceDeveloper && chartData && (
            <div className="performance-charts">
              <div className="charts-grid">
                <div className="chart-container">
                  <h3 className="chart-title">Task Status Distribution</h3>
                  <div className="chart-wrapper">
                    <Pie data={chartData.statusPie} options={chartOptions.pie} />
                  </div>
                </div>
                
                <div className="chart-container">
                  <h3 className="chart-title">Productive vs Non-Productive</h3>
                  <div className="chart-wrapper">
                    <Pie data={chartData.productivePie} options={chartOptions.pie} />
                  </div>
                </div>
                
                <div className="chart-container chart-wide">
                  <h3 className="chart-title">Daily Productivity</h3>
                  <div className="chart-wrapper">
                    <Bar data={chartData.dailyBar} options={chartOptions.bar} />
                  </div>
                </div>
                
                <div className="chart-container chart-wide">
                  <h3 className="chart-title">Weekly Productivity Trend</h3>
                  <div className="chart-wrapper">
                    <Line data={chartData.weeklyLine} options={chartOptions.line} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {performanceDeveloper && (
            <div className="status-breakdown">
              <div className="status-title">Status Breakdown</div>
              <div className="status-chips">
                {performanceTotals.status.map(([name, count]) => (
                  <span key={name} className="chip">{name}: {count}</span>
                ))}
              </div>
            </div>
          )}

          {performanceDeveloper && (
            <div className="table-wrapper">
              {groupByTask && groupedPerformanceData ? (
                <table className="grouped-table">
                  <thead>
                    <tr>
                      <th>Task</th>
                      <th>Entries</th>
                      <th>Total Productive Hours</th>
                      <th>Avg Hours/Entry</th>
                      <th>Total Time Spent</th>
                      <th>Tickets</th>
                      <th>Statuses</th>
                      <th>Date Range</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedPerformanceData.map((group, idx) => (
                      <tr key={idx}>
                        <td className="task-cell">{group.task}</td>
                        <td>{group.count}</td>
                        <td>{group.totalProductiveHours.toFixed(1)}</td>
                        <td>{group.avgProductiveHours.toFixed(1)}</td>
                        <td>{minutesToHoursString(group.totalMinutes)}</td>
                        <td className="tickets-cell">
                          {group.tickets.slice(0, 3).join(', ')}
                          {group.tickets.length > 3 && ` +${group.tickets.length - 3} more`}
                        </td>
                        <td className="statuses-cell">
                          {group.statuses.join(', ')}
                        </td>
                        <td className="date-range-cell">
                          {group.firstDate && group.lastDate ? (
                            group.firstDate.toLocaleDateString() === group.lastDate.toLocaleDateString() ? 
                              group.firstDate.toLocaleDateString() :
                              `${group.firstDate.toLocaleDateString()} - ${group.lastDate.toLocaleDateString()}`
                          ) : ''}
                        </td>
                      </tr>
                    ))}
                    {!groupedPerformanceData.length && (
                      <tr>
                        <td colSpan="8" className="no-data">No tasks to group.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Ticket</th>
                      <th>Task</th>
                      <th>Status</th>
                      <th>Productive Hours</th>
                      <th>Time Spent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {performanceRows.map((r, idx) => (
                      <tr key={idx}>
                        <td>{r.date ? new Date(r.date).toLocaleDateString() : ''}</td>
                        <td title={r.ticket}>{r.ticketDisplay}</td>
                        <td>{r.task}</td>
                        <td>{r.status}</td>
                        <td>{r.productive ? r.productive.toFixed(1) : '0'}</td>
                        <td>
                          {minutesToHoursString(r.timeSpentMinutes)}
                          {r.original && (!r.original['Time Spent'] || r.original['Time Spent'] === '') && r.productive > 0 && (
                            <span className="fallback-indicator" title="Using productive hours as time spent">*</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!performanceRows.length && (
                      <tr>
                        <td colSpan="6" className="no-data">No rows match current filters for this developer.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
