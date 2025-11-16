import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import PaperPage from './page'; // Import the component
import React from 'react'; // Import React for the mock

// --- Mocks ---

// Mock next/navigation to provide route parameters (paperId)
jest.mock('next/navigation', () => ({
  useParams: () => ({
    paperId: 'test-paper-123', // Provide a mock paperId
  }),
  useRouter: () => ({
    push: jest.fn(),
  }),
  // Mock Link to avoid errors
  Link: (props: any) => <a href={props.href}>{props.children}</a>,
}));

// --- THIS IS THE NEW FIX ---
// Mock the local resizable component directly.
// This stops Jest from ever trying to load 'react-resizable-panels'.
jest.mock('@/components/ui/resizable', () => ({
  ResizablePanelGroup: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-resizable-group">{children}</div>
  ),
  ResizablePanel: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-resizable-panel">{children}</div>
  ),
  ResizableHandle: () => <div data-testid="mock-resizable-handle" />,
}));
// --- END NEW FIX ---


// Mock react-pdf (This is critical as it won't run in Jest/jsdom)
// We will store the onLoadSuccess function to call it manually
let mockOnDocumentLoadSuccess: (({ numPages }: { numPages: number }) => void) | null = null;

jest.mock('react-pdf', () => ({
  // Mock the pdfjs object
  pdfjs: {
    GlobalWorkerOptions: { workerSrc: '' }, // Mock the worker setter
    version: '3.4.1', // Mock a version
  },
  // Mock the Document component
  Document: ({ children, onLoadSuccess, file }: any) => {
    // Save the onLoadSuccess function when the component renders
    mockOnDocumentLoadSuccess = onLoadSuccess;
    // Render the children (which includes the Page)
    return <div data-testid="mock-document" data-file={file}>{children}</div>;
  },
  // Mock the Page component
  Page: ({ pageNumber }: { pageNumber: number }) => (
    <div data-testid="mock-page">Mock PDF Page {pageNumber}</div>
  ),
}));

// Mock the CSS imports from react-pdf
jest.mock('react-pdf/dist/Page/AnnotationLayer.css', () => ({}));
jest.mock('react-pdf/dist/Page/TextLayer.css', () => ({}));

// Mock the global 'fetch' function
const mockFetch = jest.fn();
global.fetch = mockFetch;

// --- End Mocks ---

describe('Paper Page (Use Case 8: Chatbot)', () => {

  beforeEach(() => {
    // Clear all mocks before each test
    mockFetch.mockClear();
    mockOnDocumentLoadSuccess = null;
    
    // Silence console.error for expected errors
    jest.spyOn(console, 'error').mockImplementation(() => {});

    // --- Setup a sophisticated fetch mock ---
    mockFetch.mockImplementation(async (url, options) => {
      const urlString = url.toString();

      // 1. Mock the INITIAL metadata fetch (GET)
      if (urlString.includes('/api/papers/test-paper-123') && !options?.method) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            title: 'Test Paper Title',
            pdfUrl: '/pdfs/test-paper-123.pdf',
          }),
        });
      }

      // 2. Mock the CHAT API call (POST)
      if (urlString.includes('/api/chat/ask') && options?.method === 'POST') {
        const body = JSON.parse(options.body as string);
        
        // For TC-CHAT-02 (Answer Not Found)
        if (body.message === 'what is the capital of France') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ response: "I couldn't find the comprehensive answer in the document context." }),
          });
        }
        
        // For TC-CHAT-01 (Happy Path)
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ response: 'This is a mock AI answer about the paper.' }),
        });
      }

      // Fallback for any unhandled fetch
      return Promise.reject(new Error(`Unhandled fetch: ${url}`));
    });
  });
  
  afterEach(() => {
    // Restore console.error
    (console.error as jest.Mock).mockRestore();
  });

  // Helper function to render the component and simulate PDF load
  async function renderAndLoadPage() {
    render(<PaperPage />);
    
    // Wait for initial metadata to load
    await waitFor(() => {
      expect(screen.getByText('Test Paper Title')).toBeInTheDocument();
    });

    // Wait for the mock PDF document to be "rendered"
    await waitFor(() => {
      expect(screen.getByTestId('mock-document')).toBeInTheDocument();
      // Check that the onLoadSuccess prop was captured
      expect(mockOnDocumentLoadSuccess).not.toBeNull();
    });

    // --- Manually trigger the onDocumentLoadSuccess callback ---
    // This simulates the PDF loading and setting the number of pages
    // We use 'act' because this will trigger a state update
    await act(async () => {
      if (mockOnDocumentLoadSuccess) {
        mockOnDocumentLoadSuccess({ numPages: 5 });
      }
    });

    // Wait for the page controls to appear (proves PDF load was successful)
    await waitFor(() => {
      expect(screen.getByText('Page 1 of 5')).toBeInTheDocument();
    });
  }


  // Test Case: TC-CHAT-01 (Happy Path)
  it('should send a message and receive an AI response (TC-CHAT-01)', async () => {
    // 1. Initialization: Render component and wait for metadata/PDF to load
    await renderAndLoadPage();

    // 2. Test Steps: Find chat elements
    const chatInput = screen.getByPlaceholderText('Ask about this paper...');
    const sendButton = screen.getByRole('button', { name: 'Send' });

    // 3. Test Steps: Type and send a message
    fireEvent.change(chatInput, { target: { value: 'what is this paper about' } });
    fireEvent.click(sendButton);

    // 4. Expected Results: User's message appears
    await waitFor(() => {
      expect(screen.getByText('what is this paper about')).toBeInTheDocument();
    });
    
    // 5. Expected Results: "Thinking..." indicator appears
    expect(screen.getByText('Thinking...')).toBeInTheDocument();
    
    // 6. Expected Results: AI response appears (and "Thinking..." is gone)
    await waitFor(() => {
      expect(screen.getByText('This is a mock AI answer about the paper.')).toBeInTheDocument();
      expect(screen.queryByText('Thinking...')).not.toBeInTheDocument();
    });
  });


  // Test Case: TC-CHAT-02 (Answer Not Found)
  it('should show a "not found" message for an irrelevant question (TC-CHAT-02)', async () => {
    // 1. Initialization
    await renderAndLoadPage();

    // 2. Test Steps
    const chatInput = screen.getByPlaceholderText('Ask about this paper...');
    const sendButton = screen.getByRole('button', { name: 'Send' });
    fireEvent.change(chatInput, { target: { value: 'what is the capital of France' } });
    fireEvent.click(sendButton);

    // 3. Expected Results: User's message appears
    await waitFor(() => {
      expect(screen.getByText('what is the capital of France')).toBeInTheDocument();
    });

    // 4. Expected Results: "Thinking..." appears
    expect(screen.getByText('Thinking...')).toBeInTheDocument();
    
    // 5. Expected Results: AI "not found" response appears
    await waitFor(() => {
      expect(screen.getByText("I couldn't find the comprehensive answer in the document context.")).toBeInTheDocument();
      expect(screen.queryByText('Thinking...')).not.toBeInTheDocument();
    });
  });


  // Test Case: TC-CHAT-03 (Empty Submission)
  it('should not allow sending an empty or whitespace message (TC-CHAT-03)', async () => {
    // 1. Initialization
    await renderAndLoadPage();
    
    // 2. Test Steps
    const chatInput = screen.getByPlaceholderText('Ask about this paper...');
    const sendButton = screen.getByRole('button', { name: 'Send' });

    // 3. Expected Results: Button is disabled initially (it's empty)
    expect(sendButton).toBeDisabled();

    // 4. Test Steps: Type only whitespace
    fireEvent.change(chatInput, { target: { value: '   ' } });

    // 5. Expected Results: Button is still disabled
    expect(sendButton).toBeDisabled();

    // 6. Test Steps: Click the (disabled) button
    fireEvent.click(sendButton);

    // 7. Expected Results: No API call was made
    // We check if fetch was called *at all* after the initial metadata load (which is 1 call)
    expect(mockFetch).toHaveBeenCalledTimes(1); // Only the metadata call, no chat call
    expect(screen.queryByText('Thinking...')).not.toBeInTheDocument();

    // 8. Test Steps: Type valid text
    fireEvent.change(chatInput, { target: { value: 'real question' } });
    
    // 9. Expected Results: Button is now enabled
    expect(sendButton).not.toBeDisabled();
  });

});