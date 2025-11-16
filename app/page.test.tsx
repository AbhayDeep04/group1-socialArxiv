import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import HomePage from './page';

// --- Mocks ---
// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

// Mock the 'typesense' library
jest.mock('typesense', () => ({
  Client: jest.fn().mockImplementation(() => {
    return {}; 
  }),
}));

// Mock the global 'fetch' function
const mockFetch = jest.fn();
global.fetch = mockFetch;

// --- Store original env vars ---
const originalEnv = process.env;

// Mock the initial paper data (for TC-FEED-01)
const mockInitialPapers = [
  { id: 'paper1', title: 'Title for paper1', authors: ['Author A', 'Author B'], year: 2024, abstract: 'Abstract for paper1...' },
  { id: 'paper2', title: 'Title for paper2', authors: ['Author C'], year: 2024, abstract: 'Abstract for paper2...' },
];

// Mock the search results data (for TC-SEARCH-01)
const mockSearchResults = [
  { id: 'paper1', title: 'Title for paper1', authors: ['Author A', 'Author B'], year: 2024, abstract: 'Abstract for paper1...' },
];
// --- End Mocks ---


describe('Homepage (Use Cases 11 & 12)', () => {

  beforeEach(() => {
    // Reset mocks before each test
    mockFetch.mockClear();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // --- Set default (good) env vars for most tests ---
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_TYPESENSE_HOST: 'test-host',
      NEXT_PUBLIC_TYPESENSE_SEARCH_ONLY_API_KEY: 'test-key',
    };
  });
  
  afterEach(() => {
    // --- Restore original env vars ---
    process.env = originalEnv;
    (console.error as jest.Mock).mockRestore();
  });

  // Test Case: TC-FEED-01 (Happy Path - Homepage Load)
  it('should load and display initial papers (TC-FEED-01)', async () => {
    // 1. Setup Mock: Simulate a successful API call for the initial load
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockInitialPapers),
    });

    // 2. Initialization: Render the component
    render(<HomePage />);

    // 3. Expected Results: Wait for the *final content* to appear.
    await waitFor(() => {
      expect(screen.getByText('Title for paper1')).toBeInTheDocument();
    });

    // 4. Expected Results: Verify the paper cards are displayed
    expect(screen.getByText('Title for paper1')).toBeInTheDocument();
    expect(screen.getByText('Title for paper2')).toBeInTheDocument();
  });


  // Test Case: TC-SEARCH-01 (Match Found)
  it('should fetch and display search results (TC-SEARCH-01)', async () => {
    // 1. Setup Mock for initial load (must happen first)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockInitialPapers),
    });

    // 2. Initialization: Render the component
    render(<HomePage />);
    
    // 3. Wait for initial load to finish
    await waitFor(() => {
      expect(screen.getByText('Title for paper1')).toBeInTheDocument();
    });

    // 4. Setup Mock for the search API call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSearchResults),
    });

    // 5. Test Steps: Find search elements and perform search
    const searchInput = screen.getByPlaceholderText(/Search papers.../i);
    const searchButton = screen.getByRole('button', { name: /Search/i });

    fireEvent.change(searchInput, { target: { value: 'paper1' } });
    fireEvent.click(searchButton);

    // 6. Expected Results: Wait for the UI to update
    await waitFor(() => {
      // The old paper "paper2" should be gone
      expect(screen.queryByText('Title for paper2')).not.toBeInTheDocument();
      // The new search result "paper1" should still be present
      expect(screen.getByText('Title for paper1')).toBeInTheDocument();
    });
    
    // 7. Verify the correct API call was made
    expect(mockFetch).toHaveBeenCalledWith('/api/papers/search?q=paper1');
  });


  // Test Case: TC-SEARCH-02 (Empty Query)
  it('should reload initial papers when search is cleared (TC-SEARCH-02)', async () => {
    // 1. Setup Mocks (Initial load, then Search, then Clear Search)
    mockFetch.mockResolvedValueOnce({ // Initial load
      ok: true, json: () => Promise.resolve(mockInitialPapers),
    });
    mockFetch.mockResolvedValueOnce({ // Search for "paper1"
      ok: true, json: () => Promise.resolve(mockSearchResults),
    });
    mockFetch.mockResolvedValueOnce({ // Clear search (fetches '*')
      ok: true, json: () => Promise.resolve(mockInitialPapers),
    });

    // 2. Initialization & First Search
    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByText('Title for paper1')).toBeInTheDocument();
    });
    
    const searchInput = screen.getByPlaceholderText(/Search papers.../i);
    const searchButton = screen.getByRole('button', { name: /Search/i });

    fireEvent.change(searchInput, { target: { value: 'paper1' } });
    fireEvent.click(searchButton);
    
    // 3. Wait for search to complete (paper2 is gone)
    await waitFor(() => {
      expect(screen.queryByText('Title for paper2')).not.toBeInTheDocument();
    });
    
    // 4. Test Steps: Clear search and submit
    fireEvent.change(searchInput, { target: { value: '' } }); // Empty query
    fireEvent.click(searchButton);
    
    // 5. Expected Results: Wait for "paper2" to reappear
    await waitFor(() => {
      expect(screen.getByText('Title for paper2')).toBeInTheDocument();
    });
  });

  
  // Test Case: TC-FEED-02 (Config Error)
  it('should show config error if env vars are missing (TC-FEED-02)', async () => {
    // 1. Setup: Override the 'beforeEach' env vars for this test
    process.env.NEXT_PUBLIC_TYPESENSE_HOST = undefined;
    process.env.NEXT_PUBLIC_TYPESENSE_SEARCH_ONLY_API_KEY = undefined;
    
    // 2. Initialization: Render the component
    render(<HomePage />);

    // 3. Expected Results: Wait for the error message
    await waitFor(() => {
      expect(screen.getByText(/Typesense configuration is missing/)).toBeInTheDocument();
    });

    // 4. Expected Results: Verify fetch was *not* called
    expect(mockFetch).not.toHaveBeenCalled();
    expect(screen.queryByText('Loading papers...')).not.toBeInTheDocument();
  });

  
  // Test Case: TS-11.2 (No papers found - Initial Load)
  it('should show "No papers found" if initial load is empty (TS-11.2)', async () => {
    // 1. Setup Mock: Simulate an empty array response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]), // Empty array
    });

    // 2. Initialization: Render the component
    render(<HomePage />);

    // 3. Expected Results: Wait for the "No papers found" message
    await waitFor(() => {
      expect(screen.getByText('No papers found.')).toBeInTheDocument();
    });

    // 4. Expected Results: Verify no papers were rendered
    expect(screen.queryByText('Title for paper1')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading papers...')).not.toBeInTheDocument();
  });
  
  
  // Test Case: TS-12.2 (No search matches)
  it('should show "No papers found" if search returns empty (TS-12.2)', async () => {
    // 1. Setup Mock for initial load
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockInitialPapers),
    });

    // 2. Initialization: Render the component
    render(<HomePage />);
    
    // 3. Wait for initial load to finish
    await waitFor(() => {
      expect(screen.getByText('Title for paper1')).toBeInTheDocument();
    });

    // 4. Setup Mock for the search API call (empty result)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]), // Empty array
    });

    // 5. Test Steps: Find search elements and perform search
    const searchInput = screen.getByPlaceholderText(/Search papers.../i);
    const searchButton = screen.getByRole('button', { name: /Search/i });

    fireEvent.change(searchInput, { target: { value: 'zzxxyy' } });
    fireEvent.click(searchButton);

    // 6. Expected Results: Wait for UI to update
    await waitFor(() => {
      // The old papers should be gone
      expect(screen.queryByText('Title for paper1')).not.toBeInTheDocument();
      // The "No papers found" message should appear
      expect(screen.getByText('No papers found.')).toBeInTheDocument();
    });
  });

  
  // Test Case: TS-11.3 (Typesense connection error)
  it('should show a fetch error if the API call fails (TS-11.3)', async () => {
    // 1. Setup Mock: Simulate a failed API call (e.g., 500 error)
    mockFetch.mockResolvedValueOnce({
      ok: false, // Simulate a server error
      status: 500,
      json: () => Promise.resolve({ message: 'Internal Server Error' }),
    });

    // 2. Initialization: Render the component
    render(<HomePage />);

    // 3. Expected Results: Wait for the component's error message to appear
    await waitFor(() => {
      // --- THIS IS THE FIX ---
      // This text matches the DOM output: "Failed to load papers: Internal Server Error."
      expect(screen.getByText(/Failed to load papers: Internal Server Error/)).toBeInTheDocument();
      // --- END FIX ---
    });

    // 4. Expected Results: Verify no papers or loading messages are shown
    expect(screen.queryByText('Loading papers...')).not.toBeInTheDocument();
    expect(screen.queryByText('Title for paper1')).not.toBeInTheDocument();
  });

});