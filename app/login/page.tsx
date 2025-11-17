'use client'; // Required for hooks like useState and onClick handlers

import Link from 'next/link';
import { useState } from 'react'; // Import useState
import { useRouter } from 'next/navigation'; // Import useRouter for redirects
import { auth } from '@/lib/firebaseConfig'; // Import auth from our config
import { signInWithEmailAndPassword } from 'firebase/auth'; // Import Firebase sign-in function
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import Image from 'next/image';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null); // State for error messages
  const router = useRouter(); // Hook for navigation

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); // Prevent default form submission
    setError(null); // Clear previous errors

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      console.log('Login successful:', user);
      router.push('/'); // Redirect to homepage on successful login

    } catch (firebaseError: any) {
      console.error('Firebase login error:', firebaseError);
      // Provide user-friendly error messages
      if (firebaseError.code === 'auth/invalid-credential' || firebaseError.code === 'auth/user-not-found' || firebaseError.code === 'auth/wrong-password') {
         setError('Invalid email or password. Please try again.');
      } else {
        setError('Login failed. Please try again.');
      }
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900 dark:bg-gray-900">
      <Card className="w-full max-w-sm bg-gray-700 text-gray-100">
        <CardHeader className='flex flex-col items-center'>
          <Image 
          src="/CSPlogo.png"
          alt="Social arXiv Logo"
          width={200}
          height={200}
          className='object-contain'/>
          <CardTitle className="text-2xl">Login</CardTitle>
          <CardDescription className='text-gray-400'>
            Enter your email below to login to your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin}> {/* Add form tag and onSubmit */}
            <div className="grid gap-4">
              <div className="grid gap-2 text-gray-100">
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
                <div className="flex items-center text-gray-100">
                  <Label htmlFor="password">Password</Label>
                  {/* Optional: Add Forgot password link later */}
                  {/* <Link href="#" className="ml-auto inline-block text-sm underline">
                    Forgot your password?
                  </Link> */}
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder='*****'
                  required
                  value={password} // Add value prop
                  onChange={(e) => setPassword(e.target.value)} // Add onChange handler
                />
              </div>
              <Button type="submit" className="w-full font-bold hover:bg-gray-900">
                Login
              </Button>
              {/* Optional: Add OAuth buttons later */}
              {/* <Button variant="outline" className="w-full">
                Login with Google
              </Button> */}
            </div>
          </form> {/* Close form tag */}
          {/* Display error message if it exists */}
          {error && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}
          <div className="mt-4 text-center text-sm">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="hover:underline text-blue-500">
              Sign up
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}