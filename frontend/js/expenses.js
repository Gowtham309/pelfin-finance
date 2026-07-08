import { api } from './api.js';
import { fetchNotifications, setOfflineBannerVisible } from './notifications.js';

const manualForm = document.getElementById('expense-add-form');
const listTbody = document.getElementById('expenses-list-tbody');
const categoryFilter = document.getElementById('filter-expense-category');

// AI elements
const nlInput = document.getElementById('expense-nl-input');
const parseNlBtn = document.getElementById('btn-expense-parse-nl');

// Import elements
const csvFileInput = document.getElementById('expense-csv-file');
const ocrFileInput = document.getElementById('expense-ocr-file');
const ocrStatus = document.getElementById('ocr-scanner-status');

export const loadExpenses = async () => {
  try {
    const selectedCategory = categoryFilter.value;
    const filters = {};
    if (selectedCategory) {
      filters.category = selectedCategory;
    }

    const data = await api.expenses.list(filters);
    const expenses = data.expenses || [];

    renderExpensesTable(expenses);
  } catch (err) {
    console.error('Failed to load expenses list:', err);
  }
};

const renderExpensesTable = (expenses) => {
  if (expenses.length === 0) {
    listTbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--text-secondary); padding: 2rem;">
          No transactions match this category or none have been logged yet.
        </td>
      </tr>
    `;
    return;
  }

  listTbody.innerHTML = '';
  expenses.forEach((item) => {
    const tr = document.createElement('tr');
    
    const dateTd = document.createElement('td');
    dateTd.textContent = item.date;
    
    const merchTd = document.createElement('td');
    merchTd.textContent = item.merchant;
    
    const catTd = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `badge badge-${item.category.toLowerCase().replace(/[^a-z]/g, '')}`;
    badge.textContent = item.category;
    catTd.appendChild(badge);
    
    const descTd = document.createElement('td');
    descTd.textContent = item.description || '-';
    
    const amtTd = document.createElement('td');
    amtTd.style.fontWeight = '600';
    amtTd.textContent = `₹${item.amount.toFixed(2)}`;

    // Actions
    const actionTd = document.createElement('td');
    const delBtn = document.createElement('button');
    delBtn.className = 'btn-icon-delete';
    delBtn.innerHTML = `
      <svg style="width:18px;height:18px" viewBox="0 0 24 24"><path fill="currentColor" d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>
    `;
    delBtn.addEventListener('click', async () => {
      if (confirm('Delete this transaction?')) {
        try {
          await api.expenses.delete(item.id);
          loadExpenses();
          fetchNotifications(); // Refresh notifications in case limits are restored
        } catch (e) {
          alert('Failed to delete transaction.');
        }
      }
    });
    actionTd.appendChild(delBtn);

    tr.appendChild(dateTd);
    tr.appendChild(merchTd);
    tr.appendChild(catTd);
    tr.appendChild(descTd);
    tr.appendChild(amtTd);
    tr.appendChild(actionTd);

    listTbody.appendChild(tr);
  });
};

export const initExpenses = () => {
  // Set default manual form date to today
  document.getElementById('expense-date').value = new Date().toISOString().substring(0, 10);

  // Manual Form Submission
  manualForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = document.getElementById('expense-amount').value;
    const date = document.getElementById('expense-date').value;
    const category = document.getElementById('expense-category').value;
    const merchant = document.getElementById('expense-merchant').value;
    const description = document.getElementById('expense-desc').value;

    try {
      await api.expenses.create({ amount, date, category, merchant, description });
      manualForm.reset();
      document.getElementById('expense-date').value = new Date().toISOString().substring(0, 10);
      loadExpenses();
      fetchNotifications();
      alert('Transaction logged successfully!');
    } catch (err) {
      alert(err.message || 'Failed to create expense.');
    }
  });

  // Filter Categories
  categoryFilter.addEventListener('change', () => {
    loadExpenses();
  });

  // AI Parse NL Submit
  parseNlBtn.addEventListener('click', async () => {
    const text = nlInput.value.trim();
    if (!text) return;

    parseNlBtn.disabled = true;
    parseNlBtn.textContent = 'Parsing...';

    try {
      const result = await api.ai.parseNL(text);
      const parsed = result.data || {};

      setOfflineBannerVisible(parsed.fallbackActive);

      if (parsed.amount && parsed.merchant) {
        // Save automatically
        await api.expenses.create({
          amount: parsed.amount,
          date: parsed.date,
          category: parsed.category,
          merchant: parsed.merchant,
          description: parsed.description || 'Parsed via AI Assistant'
        });

        nlInput.value = '';
        loadExpenses();
        fetchNotifications();
        alert(`Successfully parsed & saved: ₹${parsed.amount.toFixed(2)} at ${parsed.merchant} (${parsed.category})`);
      } else {
        alert('Could not parse clean transaction fields. Try stating: "spent 12.50 at Walmart today".');
      }
    } catch (err) {
      alert(err.message || 'AI parsing request failed.');
    } finally {
      parseNlBtn.disabled = false;
      parseNlBtn.textContent = 'Parse & Save';
    }
  });

  // CSV Bulk Importer
  csvFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('csv', file);

    try {
      const res = await api.expenses.importCSV(formData);
      alert(`Statement imported! ${res.count} transactions successfully logged.`);
      csvFileInput.value = '';
      loadExpenses();
      fetchNotifications();
    } catch (err) {
      alert(err.message || 'Failed to import CSV.');
    }
  });

  // OCR Receipt Scanner
  ocrFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    ocrStatus.classList.remove('hidden');
    ocrStatus.textContent = 'Uploading and scanning receipt...';

    const formData = new FormData();
    formData.append('receipt', file);

    try {
      const res = await api.expenses.ocrReceipt(formData);
      const data = res.data || {};

      setOfflineBannerVisible(data.fallbackActive);

      // Pre-fill manual form for user verification
      document.getElementById('expense-amount').value = data.amount || '';
      document.getElementById('expense-date').value = data.date || new Date().toISOString().substring(0, 10);
      document.getElementById('expense-category').value = data.category || 'Miscellaneous';
      document.getElementById('expense-merchant').value = data.merchant || '';
      document.getElementById('expense-desc').value = data.description || '';

      ocrStatus.textContent = 'Scan completed! Verify details in manual form.';
      
      // Auto-hide scanner status after 5s
      setTimeout(() => {
        ocrStatus.classList.add('hidden');
      }, 5000);
      
      alert('Receipt data extracted! Please review and click "Save Transaction" to confirm.');
    } catch (err) {
      ocrStatus.textContent = 'Scanning failed.';
      alert(err.message || 'Failed to scan receipt.');
    } finally {
      ocrFileInput.value = '';
    }
  });
};
