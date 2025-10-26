'use client'; // Required for hooks like useState and onClick handlers

import Link from "next/link";
import { useState } from 'react'; // Import useState
import { useRouter } from 'next/navigation'; // Import useRouter for redirects
import { auth } from '@/lib/firebaseConfig'; // Import auth from our config
import { createUserWithEmailAndPassword } from 'firebase/auth'; // Import Firebase auth function
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null); // State for error messages
  const router = useRouter(); // Hook for navigation

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); // Prevent default form submission
    setError(null); // Clear previous errors

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      console.log('Registration successful:', user);

      // Now call our backend API to create the Firestore document
      const response = await fetch('/api/auth/onSignUp', { //
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        // We only need uid and email for the backend
        body: JSON.stringify({ uid: user.uid, email: user.email, displayName: email.split('@')[0] }), // Use email prefix as temp display name
      });

      if (!response.ok) {
        // Handle backend API error if needed
        const errorData = await response.json();
        console.error('Error calling onSignUp API:', errorData);
        setError(errorData.message || 'Failed to save user data.');
        // Optional: Sign out the user if backend failed?
        // await auth.signOut();
        return; // Stop if backend fails
      }

      console.log('Firestore user document created via API.');
      router.push('/'); // Redirect to homepage on successful registration and backend call

    } catch (firebaseError: any) {
      console.error('Firebase registration error:', firebaseError);
      // Provide user-friendly error messages
      if (firebaseError.code === 'auth/email-already-in-use') {
        setError('This email address is already registered.');
      } else if (firebaseError.code === 'auth/weak-password') {
        setError('Password should be at least 6 characters.');
      } else {
        setError('Registration failed. Please try again.');
      }
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
      <Card className="mx-auto max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Sign Up</CardTitle>
          <CardDescription>
            Enter your information to create an account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegister}> {/* Add form tag and onSubmit */}
            <div className="grid gap-4">
              {/* Optional: Add First/Last Name later if needed */}
              {/* <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="first-name">First name</Label>
                  <Input id="first-name" placeholder="Max" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="last-name">Last name</Label>
                  <Input id="last-name" placeholder="Robinson" required />
                </div>
              </div> */}
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  required
                  value={email} // Add value prop
                  onChange={(e) => setEmail(e.target.value)} // Add onChange handler
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password} // Add value prop
                  onChange={(e) => setPassword(e.target.value)} // Add onChange handler
                 />
              </div>
               {/* Optional: Add Confirm Password later */}
              {/* <div className="grid gap-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input id="confirm-password" type="password" required/>
              </div> */}
              <Button type="submit" className="w-full">
                Create an account
              </Button>
               {/* Optional: Add OAuth later */}
              {/* <Button variant="outline" className="w-full">
                Sign up with Google
              </Button> */}
            </div>
          </form> {/* Close form tag */}
          {/* Display error message if it exists */}
          {error && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}
          <div className="mt-4 text-center text-sm">
            Already have an account?{" "}
            <Link href="/login" className="underline">
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}