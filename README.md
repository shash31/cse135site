# CSE 135 HW 1

## Team members:
Shashwat Dudeja

## Droplet credentials:
Grader username: grader
Grader password: grader

## Site credentials: 
Grader login: grader
Grader password: grader

## Link to site: 
[Site](https://shash.digital)

## Github Auto-Deploy setup:
1. First, I set up a bare git repository(bare because it's apparently convention and probably so that if site scales and there are many files there aren't as many being pushed) of the site on the droplet server
2. Then, I wrote a post-receive hook at the git repository and tested it.
   `
   #!/bin/sh
    # Auto-deploy for CSE135
    # Deploys shash.digital, collector, reporting
    # Uses temp checkout + rsync only

    rm -rf "/var/repo/temprepo"

    mkdir "/var/repo/temprepo"

    git --work-tree="/var/repo/temprepo" --git-dir="/var/repo/cse135site.git" checkout -f

    rsync -a --exclude-from="/var/repo/temprepo/ignorefiles.txt" "/var/repo/temprepo/" "/var/www"
    `
3. After testing the hook and making sure it works by directly pushing to the server from my local machine, I started working on the github action.
4. I generated an ssh key and uploaded that along with some other information like the server IP address and server user to github secrets
5. Then, I wrote the github action. I use an action called ssh-agent which generates an ssh connection and I made the known_hosts file and finally set up the git remote at the server and pushed. 
6. From there, the hook we wrote earlier is triggered and the site is updated.

## Compression Text Process:
After enabling and configuring mod_deflate (which was already installed in the apache server), the size of the html file went down just to a couple kb(~0.5-2 kb) which is seen in the dev tools.

## Header Obfuscation Process: 
I searched up how to modify or set header responses in an apache server and found that there is a module called mod_headers which we can use to set or modify headers.
I tested it with custom headers and it was working with those but not with the security header. 
After researching the response process, I learned that apache likely resets it towards the end of the cycle. I still tried changing the ServerTokens setting in the security config file but it still did not work.
Then I turned to chatGPT and told it everything I had tried. Then it told me that there was another module called mod_security2 which is used for adding more protection to your server and it could allow me to change the Server header. After configuring SecServerSignature however, it still did not work and I realized that I had to set ServerTokens back to full that I had previously changed.
