#!/bin/sh
# EMQX Healthcheck Script
# Checks if MQTT (1883) and Dashboard (18083) ports are listening

perl -e 'use IO::Socket::INET; my $mqtt = IO::Socket::INET->new(PeerAddr => "localhost", PeerPort => 1883, Timeout => 2); my $dash = IO::Socket::INET->new(PeerAddr => "localhost", PeerPort => 18083, Timeout => 2); exit(!($mqtt && $dash));'
